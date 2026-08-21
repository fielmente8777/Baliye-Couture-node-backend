import { AdminModel, IAdmin } from '@models/admin';

class AdminRepository {
  create(data: Partial<IAdmin>) {
    return AdminModel.create(data);
  }

  findById(id: string) {
    return AdminModel.findById(id).exec();
  }

  /**
   * passwordHash has `select: false` on the schema, so it must be explicitly
   * requested when the caller needs to compare credentials.
   */
  findByEmail(email: string, withPassword = false) {
    const query = AdminModel.findOne({ email });
    return withPassword ? query.select('+passwordHash').exec() : query.exec();
  }

  updateById(id: string, data: Partial<IAdmin> | Record<string, unknown>) {
    return AdminModel.findByIdAndUpdate(id, data, { new: true }).exec();
  }
}

export const adminRepository = new AdminRepository();
