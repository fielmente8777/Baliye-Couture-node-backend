import * as productRepository from "@repositories/product.repository";
import { ApiError } from "@utils/apiError";

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

