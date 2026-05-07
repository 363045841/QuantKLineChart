# 构建阶段
FROM node:22-alpine AS builder

WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm@9

# 复制依赖文件
COPY package.json pnpm-lock.yaml ./

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY . .

# 构建演示应用
RUN pnpm run build:demo

# 生产阶段
FROM nginx:alpine

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

RUN apk add --no-cache gettext

COPY nginx.conf.template /etc/nginx/templates/default.conf.template

COPY --from=builder /app/dist-demo /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]