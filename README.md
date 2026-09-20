# 外贸跟单管理

一个面向外贸业务员的跟单进度管理网站，目前包含两个模块：
**「跟单进度」** 和 **「合同识别」**，后续可继续添加更多功能模块。

---

## 这个网站能做什么

- ✅ **增删改查**：新增、编辑、删除订单；搜索、按状态筛选、排序、分页
- ✅ **可视化**：顶部统计卡片（订单总数 / 待跟进 / 生产中 / 已发货 / 交期预警）
- ✅ **表格视图**：清晰列表，点表头可排序
- ✅ **看板视图**：按跟单阶段分 9 列，拖拽卡片即可改状态
- ✅ **合同识别**：上传合同 JPG/PDF，自动识别销售单号、乙方、货号、条码等字段（免费 OCR，需人工核对）
- ✅ **多端同步**：配置云端后，任何设备（电脑 / 手机 / 平板）打开同一网址，看到同一份数据

---

## 文件说明

| 文件 | 作用 |
|---|---|
| `index.html` | 页面结构 |
| `style.css` | 样式（响应式，手机也能用） |
| `config.js` | 云端配置（填这里实现多端同步） |
| `storage.js` | 数据层（本地 / 云端自动切换，含文件上传） |
| `app.js` | 跟单进度模块逻辑 |
| `contract.js` | 合同识别模块（上传 / OCR / 字段提取） |

---

## 字段说明（跟单进度）

| 字段 | 说明 |
|---|---|
| 订单号 | 留空自动生成（PO-年月日-随机） |
| 客户名称 | 必填 |
| 国家/地区 | 客户所在国 |
| 产品名称 | 产品描述 |
| 数量 | 如「5000 个」 |
| 订单金额 | 如「$12,500」 |
| 下单日期 | 日期 |
| 交期 | 预计交货日期，用于交期预警 |
| 进度状态 | 待跟进 → 报价中 → 已下单 → 生产中 → 质检 → 已发货 → 已到港 → 已完成 / 已取消 |
| 付款方式 | 如「30%预付+70%见提单」 |
| 备注 | 自由填写 |

---

## 字段说明（合同识别）

| 字段 | 说明 |
|---|---|
| 销售单号 | 合同 / 销售单编号 |
| 乙方 | 客户（乙方）名称 |
| 交货日期 | 交货时间 |
| 货号明细 | 一张合同可有多条，每条含：货号、产品描述、计量单位、装量、箱数、总数、单价(含税)、金额、EAN/EACH条码、中盒条码、外箱ITF-14条码、产品具体描述、lot号 |
| 合同原文件 | 上传的 JPG/PNG/PDF 原件，云端存到 Supabase 存储桶 |

> 💡 合同识别用的是**免费浏览器 OCR（Tesseract.js）**，不花钱、无需 key。
> 识别文字后会尽量自动填入字段，但**复杂表格（尤其多货号逐行）准确率有限**，
> 请务必对照「原始文字」核对后再保存。

# 第一阶段：本地试用（现在就能做，不需要任何账号）

**直接双击打开 `index.html`**，就能在浏览器里用起来。

此时顶部会显示灰色标签「**本地模式 · 数据仅存本机**」——数据存在当前电脑的浏览器里，
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
create table if not exists orders (
  id text primary key,
  order_no text,
  customer text,
  country text,
  product text,
  quantity text,
  amount text,
  order_date text,
  delivery_date text,
  status text,
  payment text,
  remark text,
  created_at text,
  updated_at text
);

alter table orders enable row level security;
create policy "public_all" on orders for all using (true) with check (true);

create table if not exists contracts (
  id text primary key,
  sales_order_no text,
  party_b text,
  delivery_date text,
  items jsonb,
  files jsonb,
  created_at text,
  updated_at text
);

alter table contracts enable row level security;
create policy "public_all" on contracts for all using (true) with check (true);
```

4. 点右下角 **Run**（运行），看到绿色 **Success** 就是成功了
5. 验证：左侧点 **Table Editor**，应该能看到一张叫 `orders` 的表

### 2.4 拿到两个「钥匙」（API 地址和密钥）

1. 左下角点齿轮图标 **Project Settings**
2. 左侧菜单点 **API**
3. 页面上找到并**复制**这两个值：
   - **Project URL**：形如 `https://abcdefgh.supabase.co`
   - **Project API keys** 里的 `anon` / `public` 那一长串（以 `eyJ` 开头）
4. 先记在记事本里备用

### 2.5 创建合同文件存储桶（合同识别模块用）

1. 左侧菜单点 **Storage**
2. 点 **New bucket**
3. **Name** 填 `contract-files`（必须和 `config.js` 里的 `storageBucket` 一致）
4. 勾选 **Public bucket**（公开桶，否则网页无法直接读取文件）
5. 点 **Create bucket**

---

## 第 3 步：把「钥匙」填进项目

1. 用记事本打开 `config.js`
2. 把第 2.4 步复制的两个值填进去（**值要留在引号里面**）：

```js
window.APP_CONFIG = {
  supabaseUrl: 'https://abcdefgh.supabase.co',   // ← Project URL
  supabaseAnonKey: 'eyJhbGciOi...',              // ← anon public 密钥
  tableName: 'orders',
};
```

3. 保存文件

> 💡 说明：`anon` 密钥本来就是设计给公开网页用的，写进代码、被人看到都没关系，
> 不用担心泄露。

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
   - `app.js`
   - `contract.js`
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

1. 打开那个网址，顶部标签应该变成绿色「**云端模式 · 多端同步**」
2. 新增一条订单
3. 用**手机**（或别的电脑）打开同一个网址，能看到刚才那条订单 —— 就成功了 ✅

---

## 常见问题

**Q：网页打开了，但顶部还是灰色「本地模式」？**
→ 说明 `config.js` 里的两个值没填对，或填了但没保存 / 没重新上传到 GitHub。

**Q：新增时报错「表不存在」？**
→ 说明第 2.3 步的 SQL 没执行成功，回到 SQL Editor 重新 Run 一次。

**Q：打开网页很慢或打不开？**
→ GitHub Pages / Supabase 的免费服务器在海外，国内访问偶尔慢。可尝试换网络，
或后续换国内云服务器（阿里云 / 腾讯云，需手机号注册）。

---

## 后续可扩展的模块

- 客户管理（客户档案、联系方式、跟进记录）
- 报价管理、样品单、对账单
- 数据导出 Excel
- 登录权限（如果需要区分谁能看 / 谁能改）

有需要随时说，我继续加。
