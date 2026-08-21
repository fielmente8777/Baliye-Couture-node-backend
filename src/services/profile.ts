import { ApiError } from "../utils/apiError";
import { IUser } from "../models/user";
import { userRepository } from "../repositories/user.repository";

class ProfileService {
  async getProfile(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) throw ApiError.notFound('User not found');
    return user;
  }

  async updateProfile(userId: string, data: Partial<IUser>) {
    const user = await userRepository.updateById(userId, data);
    if (!user) throw ApiError.notFound('User not found');
    return user;
  }

  async deleteProfile(userId: string) {
    const user = await userRepository.softDelete(userId);
    if (!user) throw ApiError.notFound('User not found');
    return user;
  }
}

export const profileService = new ProfileService();