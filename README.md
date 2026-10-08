# 业务员辅助系统

一个面向外贸业务员的辅助系统，包含「合同管理」「进度追踪」「计算小工具」「已有报价」四个业务模块，带登录注册和账号权限（普通用户只看自己的数据，管理员看全部）。

---

## 这个系统能做什么

- ✅ **合同管理**：记录销售单号、供应商、签订日期，一个合同可挂多个货号
- ✅ **产品信息**：每个货号有独立参数、订单类型（翻单/新单）
- ✅ **自动计算**：总数 = 装量 × 箱数；金额 = 总数 × 单价
- ✅ **进度追踪**：独立模块，关联到对应合同，按 14 步流程更新每个货号的进度
- ✅ **计算小工具**：内置运费计算、报价计算等工具；运费/报价自动算，柜子价格可修改，汇率在右上角统一设置
- ✅ **已有报价**：独立产品报价库，每货号一条报价，可传多张图片、分大类（文件夹）管理
- ✅ **账号权限**：登录后才能用；普通用户只看自己的数据，管理员看全部并管理账号
- ✅ **搜索筛选**：合同管理 / 进度追踪都支持按销售单号 / 货号搜索、按订单类型筛选
- ✅ **多端同步**：配置云端后，任何设备打开同一网址看到同一份数据

---

## 文件说明

| 文件 | 作用 |
|---|---|
| `index.html` | 页面结构（左侧导航 + 各模块 + 登录注册） |
| `style.css` | 样式 |
| `config.js` | 云端配置（填这里实现多端同步） |
| `storage.js` | 数据层（本地 / 云端自动切换，按账号过滤） |
| `auth.js` | 账号系统（注册 / 登录 / 密码加密 / 权限） |
| `app.js` | 各模块逻辑（合同 / 进度 / 运费 / 报价 / 账号管理） |

---

## 字段说明

### 合同级字段

| 字段 | 说明 |
|---|---|
| 销售单号 | 销售单编号 |
| 供应商 | 供应商（工厂）名称 |
| 签订日期 | 合同签订日期 |

### 产品级字段（每个货号一份）

| 字段 | 说明 |
|---|---|
| 货号 | 产品货号 |
| 产品描述 | 产品名称 / 描述 |
| 计量单位 | 如 个 / 箱 / 套 |
| 装量 | 每箱装多少个 |
| 箱数 | 箱数 |
| 总数 | 自动 = 装量 × 箱数 |
| 单价(含税) | 含税单价 |
| 金额 | 自动 = 总数 × 单价 |
| 交货日期 | 交货时间 |
| 船期 | 船期时间 |
| EAN/EACH条码 | 产品条码 |
| 中盒条码 | 中盒条码（如有） |
| 外箱ITF-14条码 | 外箱条码 |
| LOT号 | 批次号 |
| 包装要求 | 包装相关要求 |
| 订单类型 | 翻单 / 新单 |

> 📌 订单进度不在这里填写，请切换到左侧「**进度追踪**」模块更新。

### 订单进度（14 步，在「进度追踪」模块更新）

**前 7 步按顺序打勾**：勾选到哪一步，前面的步骤会自动打勾；每步带数字标号（1~7）体现顺序。

1. 已收到返单工厂单价交期
2. PI已发送
3. PO已收到
4. 已复核单价交期
5. 已撰写采购合同
6. 合同已敲章
7. 供应商已提供回签
8. 包材进度（彩盒 / 中盒 / 外箱分开统计，各走：沿用老设计 或 等客户做设计 → 我们设计改条码中 → 设计文件已发包装厂/工厂 → 包装厂/工厂已制作出制版 → 制版已确认；没有中盒就选中盒「无中盒」）
9. 大货制作（大货制作中 / 大货制作完毕）
10. 大货样（未寄出 / 已寄出）
11. 大货照（未齐 / 已齐）
12. 进仓单（未发 / 已发）
13. 进仓（未进仓 / 已进仓）
14. 验货（未验货 / 已验货）

### 计算小工具

内置多个小工具：运费计算、报价计算。

#### 运费计算

输入**总体积（m³）**，自动算出：

- **陆运费** = 总体积 ÷ 68 × 陆运柜子价格 × 汇率
- **海运费** = 总体积 ÷ 68 × 海运柜子价格 × 汇率

其中陆运柜子价格默认 **3000**、海运柜子价格默认 **2800**，都可修改、改后自动记住；汇率在系统右上角统一设置（默认 **6.7**）。

#### 报价计算

填写含税含运含包装单价、外箱装量、外箱长/宽/高（单位 cm），自动算出：

- **外箱体积（m³）** = 长 × 宽 × 高 ÷ 1,000,000
- **港杂费（¥/个）** = 外箱体积 ÷ 装量 × 60
- **总成本（¥/个）** = 含税含运含包装单价 + 港杂费
- **人民币报价（¥/个）** = 总成本 ×（1 + 赚的点数 ÷ 100）
- **美元报价（$/个）** = 人民币报价 ÷ 汇率

汇率在系统右上角统一设置（默认 **6.7**）。

> 运费参数存在当前浏览器里（本地），换一台设备需重新设置一次。

### 已有报价

独立维护的产品报价库，每个货号一条报价，可上传多张图片、分大类管理。

- 字段：货号、产品名称、图片（多张）、产品规格、产品包装、采购单价(¥)、外销单价($)、最小起订量、单位、内盒、出口箱尺寸（每箱数量/长/宽/高）、立方米 CBM（按长宽高自动算）、净重、毛重、供应商中文
- 大类（文件夹）：可视化新建、重命名、删除文件夹；报价可移入/移出文件夹
- 图片会压缩后随数据保存；本地模式受浏览器 5MB 上限影响，建议用云端模式存图片

> 云端使用本模块前，需在 Supabase 里再建 `quotes` 和 `quote_folders` 两张表（SQL 见第 2.3 步）。

### 账号系统（登录 / 权限）

- 打开系统先登录，没登录看不到任何数据；首次使用可在登录框点「注册」自建账号
- 普通用户只能看到并修改**自己的**合同、报价、文件夹
- 管理员账号：**wlb / 20040507**，能看所有数据，并在「👤 账号管理」里管理账号（新增 / 重置密码 / 设为管理员 / 删除）
- 密码用 SHA-256 加盐加密存储，不存明文；管理员也看不到原密码，只能帮人重置

> 云端使用账号系统前，需在 Supabase 里建 `users` 表、给数据表加 `owner` 字段（SQL 见第 2.3 步）。

---

# 第一阶段：本地试用（现在就能做，不需要任何账号）

**直接双击打开 `index.html`**，就能在浏览器里用起来。

此时左下角会显示灰色标签「**本地模式 · 数据仅存本机**」——数据存在当前电脑的浏览器里，
换一台电脑看不到。这只是为了让你先体验界面和功能。

---

# 第二阶段：云端部署（实现多端同步，免费）

## 整体思路（先看这一句，心里有数）

一共要准备 **3 样东西**，缺一不可：

1. 一个 **GitHub 账号**（免费，只要邮箱）——用来托管网页
2. 一个 **Supabase 云数据库**（免费）——用来存数据
3. 把两者**连起来**：网页读/写云数据库

> 访问网站的其他人**不需要任何账号**，谁打开链接都能看、都能改。

---

## 第 1 步：注册 GitHub 账号

1. 打开 https://github.com ，点右上角 **Sign up**
2. 依次填写：邮箱 → 密码 → 用户名 → 验证邮箱
3. 注册完成后，记住你的**用户名**（后面会用到）

---

## 第 2 步：创建 Supabase 云数据库

### 2.1 注册并登录

1. 打开 https://supabase.com ，点 **Start your project**
2. 选择 **Sign in with GitHub**，用刚才的 GitHub 账号授权登录

### 2.2 新建项目

1. 点 **New project**
2. 填写：
   - **Name**：随便填，如 `mascube`
   - **Database Password**：设一个密码（自己记住，以后用）
   - **Region**：选离你近的，如 `Southeast Asia (Singapore)`
   - 其余保持默认（免费档）
3. 点 **Create new project**，等 1~2 分钟创建完成

### 2.3 创建数据表（关键步骤，别跳过）

1. 左侧菜单点 **SQL Editor**
2. 点 **New query**（新建查询）
3. 把下面这段**全部复制**粘贴进去：

```sql
create table if not exists contracts (
  id text primary key,
  sales_order_no text,
  supplier text,
  sign_date text,
  items jsonb,
  created_at text,
  updated_at text
);

alter table contracts enable row level security;
drop policy if exists "public_all" on contracts;
create policy "public_all" on contracts for all using (true) with check (true);

create table if not exists quotes (
  id text primary key,
  folder_id text,
  item_no text,
  product_name text,
  supplier_cn text,
  product_spec text,
  product_packing text,
  purchase_price text,
  export_price text,
  moq text,
  unit text,
  inner_box text,
  ctn_qty text,
  ctn_l text,
  ctn_w text,
  ctn_h text,
  cbm text,
  nw text,
  gw text,
  images jsonb,
  created_at text,
  updated_at text
);
alter table quotes enable row level security;
drop policy if exists "public_all" on quotes;
create policy "public_all" on quotes for all using (true) with check (true);

create table if not exists quote_folders (
  id text primary key,
  name text,
  created_at text
);
alter table quote_folders enable row level security;
drop policy if exists "public_all" on quote_folders;
create policy "public_all" on quote_folders for all using (true) with check (true);

-- 账号系统
create table if not exists users (
  id text primary key,
  username text unique not null,
  password text not null,
  is_admin boolean default false,
  created_at text
);
alter table users enable row level security;
drop policy if exists "public_all" on users;
create policy "public_all" on users for all using (true) with check (true);

alter table contracts add column if not exists owner text;
alter table quotes add column if not exists owner text;
alter table quote_folders add column if not exists owner text;

update contracts set owner = 'wlb' where owner is null;
update quotes set owner = 'wlb' where owner is null;
update quote_folders set owner = 'wlb' where owner is null;

insert into users (id, username, password, is_admin, created_at)
values ('admin', 'wlb', '66376bf896cd3fd0c2e8388050e5c34e5d9c4db69016301a089be2920a78f682', true, now()::text)
on conflict (username) do nothing;
```

4. 点右下角 **Run**（运行），看到绿色 **Success** 就是成功了
5. 验证：左侧点 **Table Editor**，应该能看到一张叫 `contracts` 的表

### 2.4 拿到两个「钥匙」（API 地址和密钥）

1. 左下角点齿轮图标 **Project Settings**
2. 左侧菜单点 **API**
3. 页面上找到并**复制**这两个值：
   - **Project URL**：形如 `https://abcdefgh.supabase.co`
   - **Project API keys** 里的 `anon` / `public` 那一长串（以 `eyJ` 开头）
4. 先记在记事本里备用

---

## 第 3 步：把「钥匙」填进项目

1. 用记事本打开 `config.js`
2. 把第 2.4 步复制的两个值填进去（**值要留在引号里面**）：

```js
window.APP_CONFIG = {
  supabaseUrl: 'https://abcdefgh.supabase.co',   // ← Project URL
  supabaseAnonKey: 'eyJhbGciOi...',              // ← anon public 密钥
  tables: {
    contracts: 'contracts',
  },
};
```

3. 保存文件

> 💡 说明：`anon` 密钥本来就是设计给公开网页用的，写进代码、被人看到都没关系，不用担心泄露。

---

## 第 4 步：发布网页到网上（推荐 GitHub Pages，不用再注册新账号）

### 4.1 建一个仓库

1. 打开 https://github.com ，登录你的账号
2. 点右上角 **+** → **New repository**
3. **Repository name** 填 `mascube`
4. 选 **Public**（公开）
5. 点 **Create repository**

### 4.2 上传文件

1. 在新仓库页面，点 **Add file** → **Upload files**
2. 把下面这 6 个文件**全部拖进去**：
   - `index.html`
   - `style.css`
   - `config.js`
   - `storage.js`
   - `auth.js`
   - `app.js`
3. 点 **Commit changes**（提交）

### 4.3 开启网页

1. 点仓库顶部的 **Settings**
2. 左侧菜单点 **Pages**
3. 在 **Build and deployment** 下面：
   - **Source** 选 `Deploy from a branch`
   - **Branch** 选 `main`，目录选 `/ (root)`
   - 点 **Save**
4. 等 1~2 分钟，页面上方会显示你的网址，形如：
   `https://你的用户名.github.io/mascube/`

### 4.4 测试

1. 打开那个网址，左下角标签应该变成绿色「**云端模式 · 多端同步**」
2. 新增一条合同
3. 用**手机**（或别的电脑）打开同一个网址，能看到刚才那条合同 —— 就成功了 ✅

---

## 常见问题

**Q：网页打开了，但左下角还是灰色「本地模式」？**
→ 说明 `config.js` 里的两个值没填对，或填了但没保存 / 没重新上传到 GitHub。

**Q：新增时报错「表不存在」？**
→ 说明第 2.3 步的 SQL 没执行成功，回到 SQL Editor 重新 Run 一次。

**Q：打开网页很慢或打不开？**
→ GitHub Pages / Supabase 的免费服务器在海外，国内访问偶尔慢。可尝试换网络，或后续换国内云服务器（阿里云 / 腾讯云，需手机号注册）。

---

## 后续可扩展的模块

- 客户管理（客户档案、联系方式、跟进记录）
- 报价管理、样品单、对账单
- 数据导出 Excel
- 登录权限（如果需要区分谁能看 / 谁能改）

有需要随时说，我继续加。
