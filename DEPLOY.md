---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 605588bcc155852025e04912c1664569_e8ba417b6f0a11f1aefd5254006c9bbf
    ReservedCode1: YfsbIhrF1U43xPhZsSjOJDTkDx7WJECdlAU1LK6GEoRUMmB2KZ+GGcTutdPJHVXkht1O7D89iw/vHK8/2ekc9E4QOewwOPMfPwyArfT4+YiOgaAJglQ6SYX7OiT/yn124AL5v1HfCM7gziVbEiA1s7aeSnd8sRzP6JjaH1ghl+pAiNOG52giMQ1Nkl0=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 605588bcc155852025e04912c1664569_e8ba417b6f0a11f1aefd5254006c9bbf
    ReservedCode2: YfsbIhrF1U43xPhZsSjOJDTkDx7WJECdlAU1LK6GEoRUMmB2KZ+GGcTutdPJHVXkht1O7D89iw/vHK8/2ekc9E4QOewwOPMfPwyArfT4+YiOgaAJglQ6SYX7OiT/yn124AL5v1HfCM7gziVbEiA1s7aeSnd8sRzP6JjaH1ghl+pAiNOG52giMQ1Nkl0=
---

# 林非凡交易研究中心 · 云端部署指南

## 第 1 步：上传到 GitHub

### 1.1 安装 Git（如果还没装）

去 https://git-scm.com/download/win 下载安装，一路默认即可。

### 1.2 打开命令行

按 `Win + R`，输入 `cmd`，回车。

### 1.3 进入项目目录

```
cd C:\Users\林非凡\林非凡交易研究中心
```

### 1.4 提交所有代码

```
git add -A
git commit -m "林非凡交易研究中心 - 初始版本"
```

### 1.5 创建 GitHub 仓库

1. 浏览器打开 https://github.com/new
2. Repository name 填：`linfeifan-trading-center`
3. 选 **Public**（公开）
4. **不要勾选** "Add a README file"
5. 点 "Create repository"

### 1.6 推送代码

创建后页面会显示三行命令，复制执行中间的：

```
git remote add origin https://github.com/你的用户名/linfeifan-trading-center.git
git branch -M main
git push -u origin main
```

（把「你的用户名」换成你实际的 GitHub 用户名）

---

## 第 2 步：部署到 Vercel

### 2.1 注册 Vercel

1. 打开 https://vercel.com
2. 点 "Sign Up"，选择 "Continue with GitHub" 用 GitHub 账号登录
3. 授权后进入 Vercel 控制台

### 2.2 导入项目

1. 点 "Add New..." → "Project"
2. 在列表里找到 `linfeifan-trading-center`，点 "Import"

### 2.3 配置环境变量

在 "Environment Variables" 区域添加以下变量：

| 名称 | 值 |
|------|-----|
| `GOOGLE_API_KEY` | 你的 Google API 密钥（见本地 .env.local 中的 GOOGLE_API_KEY） |
| `ZHIPU_API_KEY` | 你的智谱 API 密钥（见本地 .env.local 中的 ZHIPU_API_KEY） |
| `DEFAULT_MODEL_PROVIDER` | google |

### 2.4 部署

点 "Deploy"，等待 2-3 分钟构建完成。完成后 Vercel 会给你一个公网地址，类似：

```
https://linfeifan-trading-center.vercel.app
```

---

## 注意事项

- **不要**把 `.env.local` 上传到 GitHub（已在 .gitignore 中排除）
- API Key 通过 Vercel 环境变量注入，不会暴露在代码中
- 每次你本地改完代码，执行 `git add -A && git commit -m "说明" && git push`，Vercel 会自动重新部署
*（内容由AI生成，仅供参考）*
