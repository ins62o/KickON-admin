export const roles = ["support", "moderator", "data_editor", "super_admin", "viewer", "operator", "admin"] as const;
export type VerifiedAccount = {id:string; email?:string; email_confirmed_at?:string; banned_until?:string};
export type Membership = {user_id?:string; is_active?:boolean; role?:string};
export function activeAdmin(member: Membership | null): boolean {
  return member?.is_active === true && roles.some(role=>role===member.role);
}
export function sameVerifiedIdentity(source: VerifiedAccount, target: VerifiedAccount): boolean {
  const available = (user:VerifiedAccount)=>Boolean(user.email_confirmed_at && user.email && (!user.banned_until || Date.parse(user.banned_until)<=Date.now()));
  return available(source) && available(target) && source.email!.trim().toLowerCase()===target.email!.trim().toLowerCase();
}
export function canRunSync(role:string):boolean { return ["data_editor","operator","admin","super_admin"].includes(role); }
export function canRestartDatabase(role:string):boolean { return role==='admin'||role==='super_admin'; }
