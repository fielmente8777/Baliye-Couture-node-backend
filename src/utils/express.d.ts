import { Role } from '@constants/role';

declare global {
  namespace Express {
    interface Request {
      authUser?: {
        id: string;
        role: Role;
      };
    }
  }
}

export {};