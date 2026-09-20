/* ============================================================
   云端数据库配置（多端同步开关）

   - supabaseUrl    ：Supabase 项目的 API 地址，形如
                      https://xxxx.supabase.co
   - supabaseAnonKey：Supabase 项目的 anon 公开密钥（一长串字母数字）
   - tables         ：各模块对应的数据表名（云端）

   两项都留空 = 本地模式（数据只存在当前浏览器，适合先试玩）。
   完整部署步骤见 README.md。
   ============================================================ */
window.APP_CONFIG = {
  supabaseUrl: 'https://ceetjsgndiaffferjxst.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNlZXRqc2duZGlhZmZmZXJqeHN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4MjY2MTUsImV4cCI6MjEwNTQwMjYxNX0.ngXH4-5u8KP1vX3VQma5ZO_Xg4H4mnNivlCv0fMyfPc',
  tables: {
    contracts: 'contracts',  // 合同追踪模块
  },
};
