/**
 * SayimApp Authentication & Mikro Restrictions Types
 * Remote SQL Server: DOGUSSRV (SayimApp_Auth)
 */

export interface MobileRole {
  role_id: number;
  role_code: 'ADMIN' | 'DEPO_MUDURU' | 'DEPO_PERSONELI' | 'SAHA_SATIS' | 'KASA_FINANS' | 'GORUNTULEME_GUEST' | string;
  role_name: string;
  description?: string;
  is_system?: boolean;
  permissions?: number[];
}

export interface MobilePermission {
  perm_id: number;
  perm_code: string;
  perm_name: string;
  module_group: 'STOK' | 'DEPO' | 'SATIS' | 'FINANS' | 'YONETIM' | string;
  description?: string;
}

export interface UserDataRestrictions {
  restriction_id?: number;
  user_id: number;
  allowed_mikro_users: string; // '*' or comma-separated user IDs e.g. '1,2,5'
  denied_mikro_users: string;  // comma-separated banned Mikro user IDs e.g. '3,7'
  allowed_depo_nos: string;    // '*' or comma-separated warehouse IDs e.g. '1,2'
  can_view_costs: boolean;     // 1: can view buying/cost price, 0: costs hidden
  can_view_all_customers: boolean; // 1: all cariler, 0: only own customers
  allowed_cari_groups?: string;
  allowed_stok_groups?: string;
}

export interface MobileUser {
  user_id: number;
  username: string;
  display_name: string;
  role_id: number;
  role_code: string;
  role_name: string;
  mikro_user_no: number;
  is_active: boolean;
  pin_code?: string;
  phone?: string;
  email?: string;
  restrictions?: UserDataRestrictions;
}
