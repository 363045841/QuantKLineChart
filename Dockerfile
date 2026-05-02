# 构建阶段
FROM node:22-alpine AS builder

WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm

# 复制依赖文件
COPY package.json pnpm-lock.yaml ./

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY . .

# 构建演示应用
RUN pnpm run build:demo

# 生产阶段 - 使用 Nginx 提供静态文件
FROM nginx:alpine

# 安装必要的工具
RUN apk add --no-cache gettext

# 复制 Nginx 配置模板
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# 从构建阶段复制演示应用文件
COPY --from=builder /app/dist-demo /usr/share/nginx/html

# 暴露端口
EXPOSE 80

# 启动 Nginx
CMD ["nginx", "-g", "daemon off;"]
