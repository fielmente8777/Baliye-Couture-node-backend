import { AdminModel, IAdmin } from '@models/admin';

export function create(data: Partial<IAdmin>) {
  return AdminModel.create(data);
}

export function findById(id: string) {
  return AdminModel.findById(id).exec();
}

/**
 * passwordHash has `select: false` on the schema, so it must be explicitly
 * requested when the caller needs to compare credentials.
 */
export function findByEmail(email: string, withPassword = false) {
  const query = AdminModel.findOne({ email });
  return withPassword ? query.select('+passwordHash').exec() : query.exec();
}

export function updateById(id: string, data: Partial<IAdmin> | Record<string, unknown>) {
  return AdminModel.findByIdAndUpdate(id, data, { new: true }).exec();
}

