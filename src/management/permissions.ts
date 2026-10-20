import type {AdminRole} from "../auth/policy";
export function canWrite(role:AdminRole,area:"support"|"moderation"|"data"){
  return ["admin","operator","super_admin"].includes(role)||(area==="support"&&role==="support")||(area==="moderation"&&role==="moderator")||(area==="data"&&role==="data_editor");
}
