const sql = require('c:/xampp/htdocs/SITEDEMO/DesktopApp/MikroStok/API_Mikro_Gateway/node_modules/mssql');

const config = {
  user: 'sa',
  password: '14531453sm**',
  server: '185.136.205.19',
  port: 1433,
  database: 'master',
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

async function setup() {
  let pool;
  try {
    console.log('Connecting to DOGUSSRV (185.136.205.19:1433)...');
    pool = await sql.connect(config);
    const serverInfo = await pool.request().query('SELECT @@SERVERNAME as server, @@VERSION as version');
    console.log('Connected successfully to:', serverInfo.recordset[0].server);

    // 1. Create Database if not exists
    console.log('Creating database [SayimApp_Auth] on DOGUSSRV...');
    await pool.request().query(`
      IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'SayimApp_Auth')
      BEGIN
        CREATE DATABASE [SayimApp_Auth];
      END
    `);
    console.log('Database [SayimApp_Auth] verified/created.');
    await pool.close();

    // 2. Connect directly to SayimApp_Auth
    const authConfig = { ...config, database: 'SayimApp_Auth' };
    pool = await sql.connect(authConfig);
    console.log('Connected to [SayimApp_Auth]. Creating tables and seed data...');

    // 3. Create Tables
    const schemaSql = `
      -- 1. ROLES
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='roles' AND xtype='U')
      CREATE TABLE [roles] (
        [role_id] INT IDENTITY(1,1) PRIMARY KEY,
        [role_code] VARCHAR(50) NOT NULL UNIQUE,
        [role_name] NVARCHAR(100) NOT NULL,
        [description] NVARCHAR(255) NULL,
        [is_system] BIT DEFAULT 1,
        [created_at] DATETIME DEFAULT GETDATE()
      );

      -- 2. PERMISSIONS
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='permissions' AND xtype='U')
      CREATE TABLE [permissions] (
        [perm_id] INT IDENTITY(1,1) PRIMARY KEY,
        [perm_code] VARCHAR(100) NOT NULL UNIQUE,
        [perm_name] NVARCHAR(150) NOT NULL,
        [module_group] NVARCHAR(50) NOT NULL,
        [description] NVARCHAR(255) NULL
      );

      -- 3. ROLE_PERMISSIONS
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='role_permissions' AND xtype='U')
      CREATE TABLE [role_permissions] (
        [role_id] INT NOT NULL,
        [perm_id] INT NOT NULL,
        PRIMARY KEY ([role_id], [perm_id]),
        FOREIGN KEY ([role_id]) REFERENCES [roles]([role_id]) ON DELETE CASCADE,
        FOREIGN KEY ([perm_id]) REFERENCES [permissions]([perm_id]) ON DELETE CASCADE
      );

      -- 4. USERS
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='users' AND xtype='U')
      CREATE TABLE [users] (
        [user_id] INT IDENTITY(1,1) PRIMARY KEY,
        [username] VARCHAR(50) NOT NULL UNIQUE,
        [password_hash] VARCHAR(255) NOT NULL,
        [display_name] NVARCHAR(100) NOT NULL,
        [role_id] INT NOT NULL,
        [mikro_user_no] INT DEFAULT 0,
        [is_active] BIT DEFAULT 1,
        [pin_code] VARCHAR(10) NULL,
        [phone] VARCHAR(30) NULL,
        [email] VARCHAR(100) NULL,
        [created_at] DATETIME DEFAULT GETDATE(),
        [updated_at] DATETIME DEFAULT GETDATE(),
        FOREIGN KEY ([role_id]) REFERENCES [roles]([role_id])
      );

      -- 5. USER_PERMISSIONS_OVERRIDE
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='user_permissions_override' AND xtype='U')
      CREATE TABLE [user_permissions_override] (
        [override_id] INT IDENTITY(1,1) PRIMARY KEY,
        [user_id] INT NOT NULL,
        [perm_id] INT NOT NULL,
        [is_granted] BIT NOT NULL,
        FOREIGN KEY ([user_id]) REFERENCES [users]([user_id]) ON DELETE CASCADE,
        FOREIGN KEY ([perm_id]) REFERENCES [permissions]([perm_id]) ON DELETE CASCADE,
        CONSTRAINT UQ_User_Perm UNIQUE ([user_id], [perm_id])
      );

      -- 6. USER_DATA_RESTRICTIONS (Mikro kullanıcı & alan kısıtlamaları)
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='user_data_restrictions' AND xtype='U')
      CREATE TABLE [user_data_restrictions] (
        [restriction_id] INT IDENTITY(1,1) PRIMARY KEY,
        [user_id] INT NOT NULL UNIQUE,
        [allowed_mikro_users] NVARCHAR(500) DEFAULT '',   -- İzin verilen Mikro kullanıcı no'ları (Örn: '1,2,5' veya '*' = hepsi)
        [denied_mikro_users] NVARCHAR(500) DEFAULT '',    -- GÖRMESİ YASAKLI Mikro kullanıcıları (Örn: '3,8')
        [allowed_depo_nos] NVARCHAR(500) DEFAULT '',      -- Müdahale edebileceği depolar (Örn: '1,2')
        [can_view_costs] BIT DEFAULT 0,                   -- Alış / Maliyet fiyatlarını görebilir mi?
        [can_view_all_customers] BIT DEFAULT 1,           -- Tüm carileri görebilir mi? (0 ise sadece atanmış cariler)
        [allowed_cari_groups] NVARCHAR(500) DEFAULT '',   -- İzin verilen cari grup kodları
        [allowed_stok_groups] NVARCHAR(500) DEFAULT '',   -- İzin verilen stok reyon/grup kodları
        [updated_at] DATETIME DEFAULT GETDATE(),
        FOREIGN KEY ([user_id]) REFERENCES [users]([user_id]) ON DELETE CASCADE
      );

      -- 7. ACTIVITY_LOGS (Kullanıcı hareket denetimi)
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='activity_logs' AND xtype='U')
      CREATE TABLE [activity_logs] (
        [log_id] BIGINT IDENTITY(1,1) PRIMARY KEY,
        [user_id] INT NULL,
        [username] VARCHAR(50) NOT NULL,
        [action_type] VARCHAR(50) NOT NULL,
        [module] VARCHAR(50) NULL,
        [action_details] NVARCHAR(1000) NULL,
        [ip_address] VARCHAR(50) NULL,
        [created_at] DATETIME DEFAULT GETDATE()
      );
    `;

    await pool.request().query(schemaSql);
    console.log('Tables created successfully.');

    // 4. Seed Roles
    const seedRolesSql = `
      IF NOT EXISTS (SELECT 1 FROM [roles] WHERE [role_code] = 'ADMIN')
      INSERT INTO [roles] ([role_code], [role_name], [description]) VALUES
      ('ADMIN', N'Süper Yönetici', N'Tüm yetkileri yöneten, kullanıcı ve kısıtlamaları düzenleyen tam yetkili rol'),
      ('DEPO_MUDURU', N'Depo Müdürü', N'Depo sayımı, transfer fişi, mal kabul ve stok kartı yetkisi olan rol'),
      ('DEPO_PERSONELI', N'Depo Personeli', N'Barkod okuma ve sayım yapan, maliyet ve kritik fiyat görmeyen saha personeli'),
      ('SAHA_SATIS', N'Plasiyer / Satış', N'Sipariş oluşturan, cari ekstresi ve tahsilat makbuzu kesebilen satış personeli'),
      ('KASA_FINANS', N'Kasa & Finans', N'Tahsilat, tediye, faturalaştırma ve cari hareketleri yöneten finans personeli'),
      ('GORUNTULEME_GUEST', N'Görüntüleme / Misafir', N'Sadece ürün sorgulama ve stok adedi görme yetkisi');
    `;
    await pool.request().query(seedRolesSql);

    // 5. Seed Permissions
    const seedPermsSql = `
      IF NOT EXISTS (SELECT 1 FROM [permissions] WHERE [perm_code] = 'MODULE_FIYAT_GOR')
      INSERT INTO [permissions] ([perm_code], [perm_name], [module_group], [description]) VALUES
      ('MODULE_FIYAT_GOR', N'Ürün & Fiyat Gör', 'STOK', N'Ürün arama, barkod tarama ve stok miktarlarını görebilme'),
      ('ACTION_SEE_BUY_PRICE', N'Alış / Maliyet Fiyatını Gör', 'STOK', N'Ürünün alış ve maliyet fiyatını görebilme yetkisi'),
      ('ACTION_EDIT_PRICE', N'Satış Fiyatı Güncelle', 'STOK', N'Mikro ERP satış fiyatını canlı güncelleyebilme'),
      ('ACTION_EDIT_NAME', N'Ürün Adı ve Detay Düzenle', 'STOK', N'Mikro ERP ürün adı ve açıklamalarını değiştirebilme'),
      ('ACTION_NEW_STOCK', N'Yeni Stok Kartı Aç', 'STOK', N'Mikro ERPye yeni ürün, reyon ve barkod kaydedebilme'),
      ('MODULE_SAYIM', N'Depo Sayımı', 'DEPO', N'Depo/reyon sayımı yapıp Mikroya Sayım Fişi aktarabilme'),
      ('MODULE_SEVK', N'Depo Transfer & Sevk', 'DEPO', N'Depolar arası sevk ve nakil fişi kesebilme'),
      ('MODULE_ALIS_FATURASI', N'Mal Kabul & Alış Faturası', 'DEPO', N'Tedarikçiden mal kabul ve alış faturası işleyebilme'),
      ('MODULE_SIPARIS_FATURA', N'Siparişi Faturalaştır', 'SATIS', N'Alınan siparişleri Toptan Satış Faturasına çevirebilme'),
      ('MODULE_YENI_SIPARIS', N'Yeni Sipariş Oluştur', 'SATIS', N'Müşteri adına yeni sipariş kaydedebilme'),
      ('MODULE_CARI_ISLEMLER', N'Cari Hesaplar & Ekstre', 'FINANS', N'Müşteri/Tedarikçi borç-alacak ve ekstrelerini görebilme'),
      ('MODULE_KASA_TAHSILAT', N'Kasa Tahsilat / Tediye', 'FINANS', N'Nakit veya POS tahsilat makbuzu kesebilme'),
      ('MODULE_CEK_SENET', N'Çek / Senet Girişi', 'FINANS', N'Müşteri çeki ve senedi kaydedebilme'),
      ('MODULE_RAPORLAR', N'Yönetim Raporları', 'YONETIM', N'Ciro, çok satanlar ve kârlılık raporlarını görebilme'),
      ('ADMIN_USER_MANAGEMENT', N'Kullanıcı & Yetki Yönetimi', 'YONETIM', N'Mobil kullanıcı ekleme, şifre değiştirme ve yetki verme');
    `;
    await pool.request().query(seedPermsSql);

    // 6. Bind Admin Permissions
    const bindAdminSql = `
      DECLARE @adminRoleId INT = (SELECT role_id FROM roles WHERE role_code = 'ADMIN');
      IF @adminRoleId IS NOT NULL
      BEGIN
        INSERT INTO role_permissions (role_id, perm_id)
        SELECT @adminRoleId, perm_id FROM permissions p
        WHERE NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = @adminRoleId AND rp.perm_id = p.perm_id);
      END
    `;
    await pool.request().query(bindAdminSql);

    // 7. Seed Default Admin User
    const seedAdminUserSql = `
      DECLARE @adminRoleId INT = (SELECT role_id FROM roles WHERE role_code = 'ADMIN');
      IF NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin')
      BEGIN
        INSERT INTO users (username, password_hash, display_name, role_id, mikro_user_no, is_active, pin_code)
        VALUES ('admin', 'admin123', N'Sistem Yöneticisi', @adminRoleId, 1, 1, '1234');

        DECLARE @newUserId INT = SCOPE_IDENTITY();
        INSERT INTO user_data_restrictions (user_id, allowed_mikro_users, denied_mikro_users, allowed_depo_nos, can_view_costs, can_view_all_customers)
        VALUES (@newUserId, '*', '', '*', 1, 1);
      END
    `;
    await pool.request().query(seedAdminUserSql);

    console.log('Seed data successfully inserted!');

    // 8. Verification query
    const resSummary = await pool.request().query(`
      SELECT 
        (SELECT COUNT(*) FROM roles) as role_count,
        (SELECT COUNT(*) FROM permissions) as perm_count,
        (SELECT COUNT(*) FROM users) as user_count,
        (SELECT COUNT(*) FROM user_data_restrictions) as restriction_count
    `);
    console.log('Verification Summary:', resSummary.recordset[0]);

    await pool.close();
    console.log('Setup completed with 100% success on DOGUSSRV!');
  } catch (err) {
    console.error('Setup failed:', err);
    if (pool) await pool.close();
  }
}

setup();
