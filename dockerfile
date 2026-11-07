FROM node:25.2.1 AS web_builder

# 安装 pnpm
RUN npm install -g pnpm@10

WORKDIR /web
COPY web/package.json web/pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --shamefully-hoist

COPY web/ ./
RUN pnpm run build:prod

FROM golang:1.26.2-alpine3.23 AS builder

ENV GO111MODULE=on
WORKDIR /go/release
ADD . .

COPY --from=web_builder /web/dist ./static/secure

ARG VERSION=unknown

RUN set -x \
    && MODULE_PATH=$(go list -m) \
    && CGO_ENABLED=0 go build -trimpath \
    -ldflags="-X '${MODULE_PATH}/app.Version=${VERSION}' -s -w -buildid=" \
    -o bepusdt ./main

FROM alpine:3.20

ENV TZ=Asia/Shanghai

# 安装所需的依赖
RUN apk add --no-cache tzdata ca-certificates

COPY --from=builder /go/release/bepusdt /usr/local/bin/bepusdt

# 设置时区
RUN ln -fs /usr/share/zoneinfo/Asia/Shanghai /etc/localtime

# 数据与日志统一放在 /var/lib/bepusdt，部署时请挂载该目录
ENV SQLITE=/var/lib/bepusdt/sqlite.db
ENV LOG=/var/lib/bepusdt/log/
RUN mkdir -p /var/lib/bepusdt/log
WORKDIR /var/lib/bepusdt
VOLUME ["/var/lib/bepusdt"]

EXPOSE 8080
ENTRYPOINT ["bepusdt"]
CMD ["start"]
