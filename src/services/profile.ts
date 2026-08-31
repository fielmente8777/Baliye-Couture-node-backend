import { ApiError } from "../utils/apiError";
import { IUser } from "../models/user";
import * as userRepository from "../repositories/user.repository";

export async function getProfile(userId: string) {
  const user = await userRepository.findById(userId);
  if (!user) throw ApiError.notFound("User not found");
  return user;
}

export async function updateProfile(userId: string, data: Partial<IUser>) {
  console.log("data kya hai bata do", data);
  const user = await userRepository.updateById(userId, data);
  if (!user) throw ApiError.notFound("User not found");
  return user;
}

export async function deleteProfile(userId: string) {
  const user = await userRepository.softDelete(userId);
  if (!user) throw ApiError.notFound("User not found");
  return user;
}
