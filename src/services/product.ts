import * as productRepository from "@repositories/product.repository";
import * as garmentTypeRepository from "@repositories/garmentType.repository";
import { IProduct } from "@models/product";
import { ApiError } from "@utils/apiError";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export interface ProductQuery {
  garmentTypeId?: string;
  tag?: string;
  badge?: "bestseller" | "editors-pick";
  mode?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  sort?: string;
}

/** §34 sort options, mapped to Mongo sorts the indexes can serve. */
const SORTS: Record<string, Record<string, 1 | -1>> = {
  newest: { createdAt: -1 },
  "price-asc": { basePrice: 1 },
  "price-desc": { basePrice: -1 },
  popular: { soldCount: -1 },
  rating: { ratingAverage: -1 },
};

function buildFilter(query: ProductQuery, publicOnly: boolean) {
  const filter: Record<string, unknown> = {};

  /* The storefront only ever sees active products; admin sees every status. */
  if (publicOnly) filter.status = "active";

  if (query.garmentTypeId) filter.garmentTypeId = query.garmentTypeId;
  if (query.tag) filter.tags = query.tag;
  if (query.mode) filter.mode = query.mode;
  if (query.badge === "bestseller") filter.isBestseller = true;
  if (query.badge === "editors-pick") filter.isEditorsPick = true;
  if (query.search) filter.$text = { $search: query.search };

  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    filter.basePrice = {
      ...(query.minPrice !== undefined ? { $gte: query.minPrice } : {}),
      ...(query.maxPrice !== undefined ? { $lte: query.maxPrice } : {}),
    };
  }

  return filter;
}

export async function listProducts(
  query: ProductQuery,
  skip: number,
  limit: number,
  publicOnly = true,
) {
  const filter = buildFilter(query, publicOnly);
  const sort = SORTS[query.sort ?? "newest"] ?? SORTS.newest;
  console.log("filter", filter);

  const [items, total] = await Promise.all([
    productRepository.findAll(filter, skip, limit, sort),
    productRepository.count(filter),
  ]);

  return { items, total };
}

export async function getProductBySlug(slug: string) {
  const product = await productRepository.findBySlug(slug);
  if (!product || product.status !== "active")
    throw ApiError.notFound("Product not found");
  return product;
}

export async function getProductById(id: string) {
  const product = await productRepository.findById(id);
  if (!product) throw ApiError.notFound("Product not found");
  return product;
}

/** Same garment type, excluding the product itself (§ related products strip). */
export async function getRelated(slug: string, limit = 4) {
  const product = await getProductBySlug(slug);

  return productRepository.findAll(
    {
      status: "active",
      garmentTypeId: product.garmentTypeId,
      _id: { $ne: product._id },
    },
    0,
    limit,
  );
}

export async function createProduct(data: Partial<IProduct>, adminId?: string) {
  const slug = data.slug || slugify(data.name ?? "");
  if (!slug) throw ApiError.badRequest("A product needs a name");

  const existing = await productRepository.findBySlug(slug);
  if (existing)
    throw ApiError.conflict("A product with that name already exists");

  if (!data.garmentTypeId)
    throw ApiError.badRequest("A product needs a garment type");

  const garmentType = await garmentTypeRepository.findById(
    String(data.garmentTypeId),
  );
  if (!garmentType)
    throw ApiError.badRequest("That garment type does not exist");

  return productRepository.create({
    ...data,
    slug,
    createdBy: adminId as never,
    updatedBy: adminId as never,
  });
}

export async function updateProduct(
  id: string,
  data: Partial<IProduct>,
  adminId?: string,
) {
  const product = await productRepository.updateById(id, {
    ...data,
    updatedBy: adminId as never,
  });
  if (!product) throw ApiError.notFound("Product not found");
  return product;
}

/**
 * §5 lifecycle. Publishing is guarded: an active product with no images or no
 * price is a broken storefront listing, so it is refused here rather than
 * discovered by a customer.
 */
export async function setStatus(
  id: string,
  status: IProduct["status"],
  adminId?: string,
) {
  const product = await productRepository.findById(id);
  if (!product) throw ApiError.notFound("Product not found");

  if (status === "active") {
    if (product.images.length === 0) {
      throw ApiError.badRequest("Add at least one image before publishing");
    }
    if (!product.basePrice || product.basePrice <= 0) {
      throw ApiError.badRequest("Set a base price before publishing");
    }
  }

  return productRepository.updateById(id, {
    status,
    updatedBy: adminId as never,
  });
}

export async function deleteProduct(id: string) {
  const product = await productRepository.softDelete(id);
  if (!product) throw ApiError.notFound("Product not found");
  return product;
}
