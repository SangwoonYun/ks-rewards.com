import { COOKIE_NAME } from '../../../utils/jwt';

export default defineEventHandler(async (event) => {
  deleteCookie(event, COOKIE_NAME, { path: '/' });
  return { success: true };
});
