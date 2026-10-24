/**
 * MIKRO ERP SQL INSERT BUILDERS (ZERO-NULL CONTRACT)
 * 
 * Mikro ERP v16/v17/v20 requires strict adherence to schema defaults:
 * - STOK_HAREKETLERI (148 columns)
 * - CARI_HESAP_HAREKETLERI (186 columns)
 * 
 * Leaving unassigned columns results in SQL Server NULL, which crashes
 * Mikro ERP Delphi Desktop runtime with Access Violations or missing field exceptions.
 */

export interface MikroSthParams {
  sth_Guid?: string;
  sth_create_user?: number;
  sth_lastup_user?: number;
  sth_special1?: string;
  sth_MainProgramNo?: number;
  sth_VersionNo?: string;
  sth_MenuNo?: string | number;
  sth_firmano?: number;
  sth_subeno?: number;
  sth_tarih?: string; // e.g. @Tarih or '2026-10-24'
  sth_tip: number; // 0: Giriş, 1: Çıkış, 2: Depolar Arası Sevk
  sth_cins: number; // 0: Mal, 1: Hizmet, 6: Depo Transfer
  sth_normal_iade?: number; // 0: Normal, 1: İade
  sth_evraktip: number; // 1: Satış İrs, 2: Sevk İrs, 3: Alış Fat, 4: Perakende Satış Fat...
  sth_evrakno_seri: string;
  sth_evrakno_sira: number | string; // e.g. @NextSira or number
  sth_satirno: number;
  sth_belge_no?: string;
  sth_belge_tarih?: string;
  sth_stok_kod: string;
  sth_miktar: number;
  sth_miktar2?: number;
  sth_birim_pntr?: number;
  sth_birimfiyat?: number;
  sth_tutar?: number;
  sth_iskonto1?: number;
  sth_iskonto2?: number;
  sth_vergi_pntr?: number;
  sth_vergi?: number;
  sth_fat_uid?: string; // e.g. @FatGuid
  sth_sip_uid?: string;
  sth_giris_depo_no: number;
  sth_cikis_depo_no: number;
  sth_malkbl_sevk_tarihi?: string;
  sth_cari_srm_merkezi?: string;
  sth_stok_srm_merkezi?: string;
  sth_cari_kodu?: string;
  sth_plasiyer_kodu?: string;
  sth_har_doviz_cinsi?: number;
  sth_har_doviz_kuru?: number;
  sth_alt_doviz_kuru?: number;
  sth_stok_doviz_cinsi?: number;
  sth_stok_doviz_kuru?: number;
  sth_aciklama?: string;
}

export interface MikroChaParams {
  cha_Guid?: string; // e.g. @FatGuid or NEWID()
  cha_create_user?: number;
  cha_lastup_user?: number;
  cha_special1?: string;
  cha_MainProgramNo?: number;
  cha_VersionNo?: string;
  cha_MenuNo?: string | number;
  cha_firmano?: number;
  cha_subeno?: number;
  cha_evrak_tip: number; // 0: Fatura (Alış), 63: Fatura (Satış)
  cha_evrakno_seri: string;
  cha_evrakno_sira: number | string;
  cha_satir_no?: number;
  cha_tarihi?: string; // @Tarih
  cha_tip: number; // 0: Borç (Alıcı borçlanır/Satış), 1: Alacak (Satıcı alacaklanır/Alış)
  cha_cinsi: number; // 6: Fatura
  cha_normal_Iade?: number;
  cha_belge_no?: string;
  cha_belge_tarih?: string;
  cha_aciklama?: string;
  cha_satici_kodu?: string;
  cha_cari_cins?: number;
  cha_kod: string;
  cha_ciro_cari_kodu?: string;
  cha_d_cins?: number;
  cha_d_kur?: number;
  cha_altd_kur?: number;
  cha_srmrkkodu?: string;
  cha_meblag: number;
  cha_aratoplam: number;
  cha_vade?: number;
  cha_ft_iskonto1?: number;
  cha_ft_iskonto2?: number;
  cha_vergi1?: number;
  cha_vergi2?: number;
  cha_vergi3?: number;
  cha_vergi4?: number;
  cha_vergi5?: number;
  cha_kdv_toplam?: number;
}

export const STH_ALL_COLUMNS = [
  'sth_Guid',
  'sth_DBCno',
  'sth_SpecRECno',
  'sth_iptal',
  'sth_fileid',
  'sth_hidden',
  'sth_kilitli',
  'sth_degisti',
  'sth_checksum',
  'sth_create_user',
  'sth_create_date',
  'sth_lastup_user',
  'sth_lastup_date',
  'sth_special1',
  'sth_special2',
  'sth_special3',
  'sth_MainProgramNo',
  'sth_VersionNo',
  'sth_MenuNo',
  'sth_MikroSpecial1',
  'sth_MikroSpecial2',
  'sth_MikroSpecial3',
  'sth_ExternalProgramType',
  'sth_ExternalProgramId',
  'sth_Hash',
  'sth_firmano',
  'sth_subeno',
  'sth_tarih',
  'sth_tip',
  'sth_cins',
  'sth_normal_iade',
  'sth_evraktip',
  'sth_evrakno_seri',
  'sth_evrakno_sira',
  'sth_satirno',
  'sth_belge_no',
  'sth_belge_tarih',
  'sth_stok_kod',
  'sth_isk_mas1',
  'sth_isk_mas2',
  'sth_isk_mas3',
  'sth_isk_mas4',
  'sth_isk_mas5',
  'sth_isk_mas6',
  'sth_isk_mas7',
  'sth_isk_mas8',
  'sth_isk_mas9',
  'sth_isk_mas10',
  'sth_sat_iskmas1',
  'sth_sat_iskmas2',
  'sth_sat_iskmas3',
  'sth_sat_iskmas4',
  'sth_sat_iskmas5',
  'sth_sat_iskmas6',
  'sth_sat_iskmas7',
  'sth_sat_iskmas8',
  'sth_sat_iskmas9',
  'sth_sat_iskmas10',
  'sth_pos_satis',
  'sth_promosyon_fl',
  'sth_cari_cinsi',
  'sth_cari_kodu',
  'sth_cari_grup_no',
  'sth_isemri_gider_kodu',
  'sth_plasiyer_kodu',
  'sth_har_doviz_cinsi',
  'sth_har_doviz_kuru',
  'sth_alt_doviz_kuru',
  'sth_stok_doviz_cinsi',
  'sth_stok_doviz_kuru',
  'sth_miktar',
  'sth_miktar2',
  'sth_birim_pntr',
  'sth_birimfiyat',
  'sth_tutar',
  'sth_iskonto1',
  'sth_iskonto2',
  'sth_iskonto3',
  'sth_iskonto4',
  'sth_iskonto5',
  'sth_iskonto6',
  'sth_masraf1',
  'sth_masraf2',
  'sth_masraf3',
  'sth_masraf4',
  'sth_vergi_pntr',
  'sth_vergi',
  'sth_masraf_vergi_pntr',
  'sth_masraf_vergi',
  'sth_netagirlik',
  'sth_odeme_op',
  'sth_aciklama',
  'sth_sip_uid',
  'sth_fat_uid',
  'sth_giris_depo_no',
  'sth_cikis_depo_no',
  'sth_malkbl_sevk_tarihi',
  'sth_cari_srm_merkezi',
  'sth_stok_srm_merkezi',
  'sth_fis_tarihi',
  'sth_fis_sirano',
  'sth_vergisiz_fl',
  'sth_maliyet_ana',
  'sth_maliyet_alternatif',
  'sth_maliyet_orjinal',
  'sth_adres_no',
  'sth_parti_kodu',
  'sth_lot_no',
  'sth_kons_uid',
  'sth_proje_kodu',
  'sth_exim_kodu',
  'sth_otv_pntr',
  'sth_otv_vergi',
  'sth_brutagirlik',
  'sth_disticaret_turu',
  'sth_otvtutari',
  'sth_otvvergisiz_fl',
  'sth_oiv_pntr',
  'sth_oiv_vergi',
  'sth_oivvergisiz_fl',
  'sth_fiyat_liste_no',
  'sth_oivtutari',
  'sth_Tevkifat_turu',
  'sth_nakliyedeposu',
  'sth_nakliyedurumu',
  'sth_yetkili_uid',
  'sth_taxfree_fl',
  'sth_ilave_edilecek_kdv',
  'sth_ismerkezi_kodu',
  'sth_HareketGrupKodu1',
  'sth_HareketGrupKodu2',
  'sth_HareketGrupKodu3',
  'sth_Olcu1',
  'sth_Olcu2',
  'sth_Olcu3',
  'sth_Olcu4',
  'sth_Olcu5',
  'sth_FormulMiktarNo',
  'sth_FormulMiktar',
  'sth_eirs_senaryo',
  'sth_eirs_tipi',
  'sth_teslim_tarihi',
  'sth_matbu_fl',
  'sth_satis_fiyat_doviz_cinsi',
  'sth_satis_fiyat_doviz_kuru',
  'sth_eticaret_kanal_kodu',
  'sth_bagli_ithalat_kodu',
  'sth_tevkifat_sifirlandi_fl'
];

export function buildMikroSthInsert(p: MikroSthParams): string {
  const user = p.sth_create_user || 1;
  const seri = (p.sth_evrakno_seri || '').replace(/'/g, "''");
  const stokKod = (p.sth_stok_kod || '').replace(/'/g, "''");
  const cariKod = (p.sth_cari_kodu || '').replace(/'/g, "''");
  const plasiyer = (p.sth_plasiyer_kodu || '').replace(/'/g, "''");
  const belgeNo = (p.sth_belge_no || '').replace(/'/g, "''");
  const cariSrm = (p.sth_cari_srm_merkezi || '').replace(/'/g, "''");
  const stokSrm = (p.sth_stok_srm_merkezi || '').replace(/'/g, "''");
  const aciklama = (p.sth_aciklama || '').replace(/'/g, "''");
  const menuNo = p.sth_MenuNo ? String(p.sth_MenuNo) : '12500';
  const special1 = (p.sth_special1 || '').replace(/'/g, "''");
  const guid = p.sth_Guid || 'NEWID()';
  const fatUid = p.sth_fat_uid || "'00000000-0000-0000-0000-000000000000'";
  const sipUid = p.sth_sip_uid || "'00000000-0000-0000-0000-000000000000'";
  const tarih = p.sth_tarih || '@Tarih';
  const belgeTarih = p.sth_belge_tarih || tarih;
  const malkblTarih = p.sth_malkbl_sevk_tarihi || tarih;

  const vals: string[] = [
    guid, '0', '0', '0', '16', '0', '0', '0', '0',
    String(user), '@Now', String(p.sth_lastup_user || user), '@Now',
    `'${special1}'`, "''", "''", '21', "'17.05d'", `'${menuNo}'`, "''", "''", "''",
    '0', "''", '0', String(p.sth_firmano || 0), String(p.sth_subeno || 0),
    tarih, String(p.sth_tip), String(p.sth_cins), String(p.sth_normal_iade || 0), String(p.sth_evraktip),
    `'${seri}'`, String(p.sth_evrakno_sira), String(p.sth_satirno),
    `'${belgeNo}'`, belgeTarih, `'${stokKod}'`,
    // iskontolar 1..10
    '0', '0', '0', '0', '0', '0', '0', '0', '0', '0',
    // sat_iskmas 1..10
    '0', '0', '0', '0', '0', '0', '0', '0', '0', '0',
    '0', '0', '0', `'${cariKod}'`, '0', "''", `'${plasiyer}'`,
    String(p.sth_har_doviz_cinsi || 0), String(p.sth_har_doviz_kuru || 1), String(p.sth_alt_doviz_kuru || 49.25),
    String(p.sth_stok_doviz_cinsi || 0), String(p.sth_stok_doviz_kuru || 1),
    String(p.sth_miktar), String(p.sth_miktar2 !== undefined ? p.sth_miktar2 : p.sth_miktar),
    String(p.sth_birim_pntr || 1), String(p.sth_birimfiyat || 0), String(p.sth_tutar || 0),
    String(p.sth_iskonto1 || 0), String(p.sth_iskonto2 || 0), '0', '0', '0', '0',
    '0', '0', '0', '0',
    String(p.sth_vergi_pntr || 0), String(p.sth_vergi || 0),
    '0', '0', '0', '0',
    `'${aciklama}'`, sipUid, fatUid,
    String(p.sth_giris_depo_no), String(p.sth_cikis_depo_no),
    malkblTarih, `'${cariSrm}'`, `'${stokSrm}'`,
    "'1899-12-30'", '0', '0', '0', '0', '0', '1', "''", '0',
    "'00000000-0000-0000-0000-000000000000'", "''", "''",
    '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0',
    "'00000000-0000-0000-0000-000000000000'", '0', '0', "''", "''", "''", "''",
    '0', '0', '0', '0', '0', '0', '0', '0', '0',
    tarih, '0', '0', '0', "''", "''", '0'
  ];

  return `INSERT INTO STOK_HAREKETLERI (${STH_ALL_COLUMNS.join(', ')}) VALUES (${vals.join(', ')});`;
}

export const CHA_ALL_COLUMNS = [
  'cha_Guid',
  'cha_DBCno',
  'cha_SpecRecNo',
  'cha_iptal',
  'cha_fileid',
  'cha_hidden',
  'cha_kilitli',
  'cha_degisti',
  'cha_CheckSum',
  'cha_create_user',
  'cha_create_date',
  'cha_lastup_user',
  'cha_lastup_date',
  'cha_special1',
  'cha_special2',
  'cha_special3',
  'cha_MainProgramNo',
  'cha_VersionNo',
  'cha_MenuNo',
  'cha_MikroSpecial1',
  'cha_MikroSpecial2',
  'cha_MikroSpecial3',
  'cha_ExternalProgramType',
  'cha_ExternalProgramId',
  'cha_Hash',
  'cha_firmano',
  'cha_subeno',
  'cha_evrak_tip',
  'cha_evrakno_seri',
  'cha_evrakno_sira',
  'cha_satir_no',
  'cha_tarihi',
  'cha_tip',
  'cha_cinsi',
  'cha_normal_Iade',
  'cha_tpoz',
  'cha_ticaret_turu',
  'cha_belge_no',
  'cha_belge_tarih',
  'cha_aciklama',
  'cha_satici_kodu',
  'cha_EXIMkodu',
  'cha_projekodu',
  'cha_yat_tes_kodu',
  'cha_cari_cins',
  'cha_kod',
  'cha_ciro_cari_kodu',
  'cha_d_cins',
  'cha_d_kur',
  'cha_altd_kur',
  'cha_grupno',
  'cha_srmrkkodu',
  'cha_kasa_hizmet',
  'cha_kasa_hizkod',
  'cha_karsidcinsi',
  'cha_karsid_kur',
  'cha_karsidgrupno',
  'cha_karsisrmrkkodu',
  'cha_miktari',
  'cha_birimfiyat',
  'cha_meblag',
  'cha_aratoplam',
  'cha_vade',
  'cha_Vade_Farki_Yuz',
  'cha_ft_iskonto1',
  'cha_ft_iskonto2',
  'cha_ft_iskonto3',
  'cha_ft_iskonto4',
  'cha_ft_iskonto5',
  'cha_ft_iskonto6',
  'cha_ft_masraf1',
  'cha_ft_masraf2',
  'cha_ft_masraf3',
  'cha_ft_masraf4',
  'cha_isk_mas1',
  'cha_isk_mas2',
  'cha_isk_mas3',
  'cha_isk_mas4',
  'cha_isk_mas5',
  'cha_isk_mas6',
  'cha_isk_mas7',
  'cha_isk_mas8',
  'cha_isk_mas9',
  'cha_isk_mas10',
  'cha_sat_iskmas1',
  'cha_sat_iskmas2',
  'cha_sat_iskmas3',
  'cha_sat_iskmas4',
  'cha_sat_iskmas5',
  'cha_sat_iskmas6',
  'cha_sat_iskmas7',
  'cha_sat_iskmas8',
  'cha_sat_iskmas9',
  'cha_sat_iskmas10',
  'cha_yuvarlama',
  'cha_StFonPntr',
  'cha_stopaj',
  'cha_savsandesfonu',
  'cha_avansmak_damgapul',
  'cha_vergipntr',
  'cha_vergisiz_fl',
  'cha_otvtutari',
  'cha_otvvergisiz_fl',
  'cha_oiv_pntr',
  'cha_oivtutari',
  'cha_oiv_vergi',
  'cha_oivergisiz_fl',
  'cha_fis_tarih',
  'cha_fis_sirano',
  'cha_trefno',
  'cha_sntck_poz',
  'cha_reftarihi',
  'cha_istisnakodu',
  'cha_pos_hareketi',
  'cha_meblag_ana_doviz_icin_gecersiz_fl',
  'cha_meblag_alt_doviz_icin_gecersiz_fl',
  'cha_meblag_orj_doviz_icin_gecersiz_fl',
  'cha_sip_uid',
  'cha_kirahar_uid',
  'cha_vardiya_tarihi',
  'cha_vardiya_no',
  'cha_vardiya_evrak_ti',
  'cha_ebelge_turu',
  'cha_tevkifat_toplam',
  'cha_e_islem_turu',
  'cha_fatura_belge_turu',
  'cha_diger_belge_adi',
  'cha_uuid',
  'cha_adres_no',
  'cha_vergifon_toplam',
  'cha_ilk_belge_tarihi',
  'cha_ilk_belge_doviz_kuru',
  'cha_HareketGrupKodu1',
  'cha_HareketGrupKodu2',
  'cha_HareketGrupKodu3',
  'cha_ebelgeno_seri',
  'cha_ebelgeno_sira',
  'cha_hubid',
  'cha_hubglbid',
  'cha_bsba_e_belge_mi',
  'cha_eticaret_kanal_kodu',
  'cha_hizli_satis_kasa_no',
  'cha_ebelge_Islemturu',
  'cha_tevkifat_sifirlandi_fl',
  'cha_vergi1',
  'cha_vergi2',
  'cha_vergi3',
  'cha_vergi4',
  'cha_vergi5',
  'cha_vergi6',
  'cha_vergi7',
  'cha_vergi8',
  'cha_vergi9',
  'cha_vergi10',
  'cha_vergi11',
  'cha_vergi12',
  'cha_vergi13',
  'cha_vergi14',
  'cha_vergi15',
  'cha_vergi16',
  'cha_vergi17',
  'cha_vergi18',
  'cha_vergi19',
  'cha_vergi20',
  'cha_ilave_edilecek_kdv1',
  'cha_ilave_edilecek_kdv2',
  'cha_ilave_edilecek_kdv3',
  'cha_ilave_edilecek_kdv4',
  'cha_ilave_edilecek_kdv5',
  'cha_ilave_edilecek_kdv6',
  'cha_ilave_edilecek_kdv7',
  'cha_ilave_edilecek_kdv8',
  'cha_ilave_edilecek_kdv9',
  'cha_ilave_edilecek_kdv10',
  'cha_ilave_edilecek_kdv11',
  'cha_ilave_edilecek_kdv12',
  'cha_ilave_edilecek_kdv13',
  'cha_ilave_edilecek_kdv14',
  'cha_ilave_edilecek_kdv15',
  'cha_ilave_edilecek_kdv16',
  'cha_ilave_edilecek_kdv17',
  'cha_ilave_edilecek_kdv18',
  'cha_ilave_edilecek_kdv19',
  'cha_ilave_edilecek_kdv20',
  'cha_efatura_belge_tipi'
];

export function buildMikroChaInsert(p: MikroChaParams): string {
  const user = p.cha_create_user || 1;
  const seri = (p.cha_evrakno_seri || '').replace(/'/g, "''");
  const cariKod = (p.cha_kod || '').replace(/'/g, "''");
  const ciroKod = (p.cha_ciro_cari_kodu || cariKod).replace(/'/g, "''");
  const saticiKod = (p.cha_satici_kodu || '').replace(/'/g, "''");
  const srmKod = (p.cha_srmrkkodu || '').replace(/'/g, "''");
  const belgeNo = (p.cha_belge_no || '').replace(/'/g, "''");
  const aciklama = (p.cha_aciklama || '').replace(/'/g, "''");
  const menuNo = p.cha_MenuNo ? String(p.cha_MenuNo) : '61190';
  const special1 = (p.cha_special1 || '').replace(/'/g, "''");
  const guid = p.cha_Guid || '@FatGuid';
  const tarih = p.cha_tarihi || '@Tarih';
  const belgeTarih = p.cha_belge_tarih || tarih;

  const vals: string[] = [
    guid, '0', '0', '0', '51', '0', '0', '0', '0',
    String(user), '@Now', String(p.cha_lastup_user || user), '@Now',
    `'${special1}'`, "''", "''", '21', "'17.05d'", `'${menuNo}'`, "''", "''", "''",
    '0', "''", '0', String(p.cha_firmano || 0), String(p.cha_subeno || 0),
    String(p.cha_evrak_tip), `'${seri}'`, String(p.cha_evrakno_sira), String(p.cha_satir_no || 0),
    tarih, String(p.cha_tip), String(p.cha_cinsi), String(p.cha_normal_Iade || 0),
    '0', '0', `'${belgeNo}'`, belgeTarih, `'${aciklama}'`,
    `'${saticiKod}'`, "''", "''", "''", String(p.cha_cari_cins || 0),
    `'${cariKod}'`, `'${ciroKod}'`,
    String(p.cha_d_cins || 0), String(p.cha_d_kur || 1), String(p.cha_altd_kur || 49.25),
    '0', `'${srmKod}'`, '0', "''", '0', '0', '0', "''",
    '0', '0', String(p.cha_meblag.toFixed(2)), String(p.cha_aratoplam.toFixed(2)),
    String(p.cha_vade || 0), '0',
    String(p.cha_ft_iskonto1 || 0), String(p.cha_ft_iskonto2 || 0), '0', '0', '0', '0',
    '0', '0', '0', '0',
    // isk_mas 1..10
    '0', '0', '0', '0', '0', '0', '0', '0', '0', '0',
    // sat_iskmas 1..10
    '0', '0', '0', '0', '0', '0', '0', '0', '0', '0',
    '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0',
    "'1899-12-30'", '0', "''", '0', "'1899-12-30'", '0', '0',
    '0', '0', '0',
    "'00000000-0000-0000-0000-000000000000'", "'00000000-0000-0000-0000-000000000000'",
    "'1899-12-30'", '0', '0', '0', '0', '0', '0', "''", "''", '0', '0',
    "'1899-12-30'", '0', "''", "''", "''", "''", '0', "''", "''", '0', "''", '0', '0', "''",
    // vergi1..20
    String(p.cha_vergi1 || 0), String(p.cha_vergi2 || 0), String(p.cha_vergi3 || 0),
    String(p.cha_vergi4 || 0), String(p.cha_vergi5 || 0),
    '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0',
    // ilave_edilecek_kdv1..20
    '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0',
    "''"
  ];

  return `INSERT INTO CARI_HESAP_HAREKETLERI (${CHA_ALL_COLUMNS.join(', ')}) VALUES (${vals.join(', ')});`;
}

export interface MikroSfiyatParams {
  sfiyat_Guid?: string;
  sfiyat_create_user?: number;
  sfiyat_lastup_user?: number;
  sfiyat_stokkod: string;
  sfiyat_listesirano: number;
  sfiyat_deposirano?: number;
  sfiyat_odemeplan?: number;
  sfiyat_birim_pntr?: number;
  sfiyat_fiyati: number;
  sfiyat_doviz?: number;
  sfiyat_iskontokod?: string;
  sfiyat_deg_nedeni?: number;
  sfiyat_primyuzdesi?: number;
  sfiyat_kampanyakod?: string;
  sfiyat_doviz_kuru?: number;
  sfiyat_MenuNo?: string;
}

export const SFIYAT_ALL_COLUMNS = [
  'sfiyat_Guid', 'sfiyat_DBCno', 'sfiyat_SpecRECno', 'sfiyat_iptal', 'sfiyat_fileid', 'sfiyat_hidden', 'sfiyat_kilitli', 'sfiyat_degisti', 'sfiyat_checksum',
  'sfiyat_create_user', 'sfiyat_create_date', 'sfiyat_lastup_user', 'sfiyat_lastup_date',
  'sfiyat_special1', 'sfiyat_special2', 'sfiyat_special3',
  'sfiyat_MainProgramNo', 'sfiyat_VersionNo', 'sfiyat_MenuNo',
  'sfiyat_MikroSpecial1', 'sfiyat_MikroSpecial2', 'sfiyat_MikroSpecial3',
  'sfiyat_ExternalProgramType', 'sfiyat_ExternalProgramId', 'sfiyat_Hash',
  'sfiyat_stokkod', 'sfiyat_listesirano', 'sfiyat_deposirano', 'sfiyat_odemeplan',
  'sfiyat_birim_pntr', 'sfiyat_fiyati', 'sfiyat_doviz', 'sfiyat_iskontokod',
  'sfiyat_deg_nedeni', 'sfiyat_primyuzdesi', 'sfiyat_kampanyakod', 'sfiyat_doviz_kuru'
];

export function buildMikroSfiyatInsert(p: MikroSfiyatParams): string {
  const user = p.sfiyat_create_user || 1;
  const sKod = (p.sfiyat_stokkod || '').replace(/'/g, "''");
  const iskontokod = (p.sfiyat_iskontokod || '').replace(/'/g, "''");
  const kampanyakod = (p.sfiyat_kampanyakod || '').replace(/'/g, "''");
  const menuNo = (p.sfiyat_MenuNo || '31200').replace(/'/g, "''");
  const guid = p.sfiyat_Guid || 'NEWID()';

  const vals: string[] = [
    guid, '0', '0', '0', '228', '0', '0', '0', '0',
    String(user), '@Now', String(p.sfiyat_lastup_user || user), '@Now',
    "''", "''", "''",
    '21', "'17.05d'", `'${menuNo}'`,
    "''", "''", "''",
    '0', "''", '0',
    `'${sKod}'`, String(p.sfiyat_listesirano), String(p.sfiyat_deposirano || 0), String(p.sfiyat_odemeplan || 0),
    String(p.sfiyat_birim_pntr || 1), String(p.sfiyat_fiyati), String(p.sfiyat_doviz || 0), `'${iskontokod}'`,
    String(p.sfiyat_deg_nedeni || 0), String(p.sfiyat_primyuzdesi || 0), `'${kampanyakod}'`, String(p.sfiyat_doviz_kuru || 1)
  ];

  return `INSERT INTO STOK_SATIS_FIYAT_LISTELERI (${SFIYAT_ALL_COLUMNS.join(', ')}) VALUES (${vals.join(', ')});`;
}

