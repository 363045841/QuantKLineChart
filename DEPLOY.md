# KLineChart 部署指南（含 Baostock 后端）

## 快速部署

在 `kmap/klinechart` 目录下执行：

```bash
# 一键部署前后端
./deploy.sh
```

访问 `http://服务器IP:3000`

---

## 部署架构

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   用户浏览器  │────▶│  KLineChart  │────▶│  Stockbao   │
│             │     │   (Nginx)    │     │  (FastAPI)  │
│             │◀────│   端口:3000   │◀────│   端口:8000  │
└─────────────┘     └─────────────┘     └─────────────┘
                                              │
                                              ▼
                                         ┌─────────┐
                                         │ BaoStock │
                                         │  数据源   │
                                         └─────────┘
```

---

## 服务说明

| 服务 | 端口 | 说明 |
|------|------|------|
| klinechart | 3000 | Vue 前端，Nginx 代理 |
| stockbao | 8000 | FastAPI 后端，BaoStock 数据接口 |

---

## 配置选项

编辑 `klinechart/.env.deploy`：

```bash
# 复制示例配置
cp .env.deploy.example .env.deploy

# 编辑配置
vim .env.deploy
```

默认配置：

```bash
PORT=3000                    # 前端端口
BAOSTOCK_PORT=8000          # 后端端口
AKTOOLS_URL=http://host.docker.internal:8080/  # AKTools（如有）
```

---

## 常用命令

```bash
# 在 klinechart 目录下操作

cd klinechart

# 部署/更新（自动重建）
./deploy.sh

# 查看日志
docker-compose logs -f

# 查看后端日志
docker-compose logs -f stockbao

# 停止所有服务
docker-compose down

# 只重启后端
docker-compose restart stockbao

# 进入后端容器
docker-compose exec stockbao sh
```

---

## 文件说明

| 文件 | 说明 |
|------|------|
| `Dockerfile` | 前端构建配置 |
| `docker-compose.yml` | 前后端服务编排 |
| `nginx.conf.template` | Nginx 代理配置 |
| `deploy.sh` | 一键部署脚本 |
| `.env.deploy` | 环境变量 |
| `../stockbao/Dockerfile` | 后端构建配置 |

---

## 数据说明

**BaoStock** 数据源特点：
- 免费，不需要 API Key
- 日线数据限制：每日十万次调用
- 首次请求较慢（需要登录验证）
- 支持 A 股、港股、美股数据

---

## 故障排查

### 后端连接失败

```bash
# 检查 stockbao 是否运行
curl http://localhost:8000/

# 检查后端日志
docker-compose logs stockbao
```

### 前端无法访问

```bash
# 检查容器状态
docker-compose ps

# 检查前端日志
docker-compose logs klinechart
```

### 数据加载慢

BaoStock 首次请求需要登录，耐心等待。后续请求会快很多。
