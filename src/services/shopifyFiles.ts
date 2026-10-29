import { adminGraphQL } from '@config/shopify';
import { ApiError } from '@utils/apiError';

/**
 * Uploads an image into Shopify Files (Content → Files) and returns the
 * MediaImage id and its CDN url.
 *
 * Shopify takes uploads in three steps: ask for a staged target, POST the
 * bytes there, then register the file. Registration is asynchronous — the
 * MediaImage starts UPLOADED/PROCESSING and only has a url once READY, so the
 * last step polls.
 *
 * Needs the `write_files` scope.
 */

const STAGED_UPLOAD = `
  mutation($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets { url resourceUrl parameters { name value } }
      userErrors { field message }
    }
  }
`;

const FILE_CREATE = `
  mutation($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files { id fileStatus }
      userErrors { field message }
    }
  }
`;

const FILE_STATUS = `
  query($id: ID!) {
    node(id: $id) {
      ... on MediaImage {
        fileStatus
        fileErrors { message }
        image { url }
      }
    }
  }
`;

interface StagedUploadResponse {
  stagedUploadsCreate: {
    stagedTargets: { url: string; resourceUrl: string; parameters: { name: string; value: string }[] }[];
    userErrors: { message: string }[];
  };
}

interface FileCreateResponse {
  fileCreate: {
    files: { id: string; fileStatus: string }[];
    userErrors: { message: string }[];
  };
}

interface FileStatusResponse {
  node: {
    fileStatus?: string;
    fileErrors?: { message: string }[];
    image?: { url: string } | null;
  } | null;
}

export interface UploadedImage {
  /** gid://shopify/MediaImage/… — what a metaobject file field stores. */
  id: string;
  url: string;
}

const POLL_EVERY_MS = 1000;
const POLL_FOR_MS = 30_000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function uploadImageToShopify(file: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  alt?: string;
}): Promise<UploadedImage> {
  const staged = await adminGraphQL<StagedUploadResponse>(STAGED_UPLOAD, {
    input: [
      {
        resource: 'IMAGE',
        filename: file.filename,
        mimeType: file.mimeType,
        fileSize: String(file.buffer.length),
        httpMethod: 'POST',
      },
    ],
  });

  const stageErrors = staged.stagedUploadsCreate.userErrors;
  const target = staged.stagedUploadsCreate.stagedTargets[0];
  if (stageErrors.length || !target) {
    throw ApiError.badRequest(`Shopify refused the upload: ${stageErrors.map((e) => e.message).join('; ')}`);
  }

  /* The signed parameters must come before the file in the form. */
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append('file', new Blob([new Uint8Array(file.buffer)], { type: file.mimeType }), file.filename);

  const put = await fetch(target.url, { method: 'POST', body: form });
  if (!put.ok) {
    throw ApiError.internal(`Uploading to Shopify storage failed (${put.status})`);
  }

  const created = await adminGraphQL<FileCreateResponse>(FILE_CREATE, {
    files: [{ originalSource: target.resourceUrl, contentType: 'IMAGE', alt: file.alt ?? '' }],
  });

  const createErrors = created.fileCreate.userErrors;
  const id = created.fileCreate.files[0]?.id;
  if (createErrors.length || !id) {
    throw ApiError.badRequest(`Shopify could not save the file: ${createErrors.map((e) => e.message).join('; ')}`);
  }

  const deadline = Date.now() + POLL_FOR_MS;
  while (Date.now() < deadline) {
    const { node } = await adminGraphQL<FileStatusResponse>(FILE_STATUS, { id });

    if (node?.fileStatus === 'READY' && node.image?.url) return { id, url: node.image.url };
    if (node?.fileStatus === 'FAILED') {
      const reason = node.fileErrors?.map((e) => e.message).join('; ') || 'unknown reason';
      throw ApiError.badRequest(`Shopify could not process the image: ${reason}`);
    }

    await wait(POLL_EVERY_MS);
  }

  throw ApiError.internal('Shopify is still processing the image — try again in a minute');
}
