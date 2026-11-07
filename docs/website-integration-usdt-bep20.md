# 网站对接 BEpusdt（仅 BSC 上的 USDT，`usdt.bep20`）

本文只讲一种场景：你的网站传人民币（或其它法币）金额，BEpusdt 按汇率换算成 USDT，用户在 BSC 链上用 BEP20 USDT 付款，到账后 BEpusdt 回调你的网站。

文中的请求、响应格式来自本地测试环境（`http://127.0.0.1:8080`）的真实运行结果。对接令牌在文中统一写成占位符 `YOUR_API_AUTH_TOKEN_PLACEHOLDER`，示例里的签名是用这个占位符算出来的：想核对自己的签名代码，把占位符原样当作令牌代入即可得到相同结果；要对接真实的 BEpusdt，请把令牌换成后台里你自己的对接令牌，并重新计算签名。**线上环境的地址和对接令牌必须换成你自己的，见[上线前检查](#10-上线前检查)。**

## 0. 本地测试环境信息

| 项 | 值 |
|---|---|
| BEpusdt 地址 | `http://127.0.0.1:8080` |
| 对接令牌（ApiAuthToken） | 在后台查看，文中用占位符 `YOUR_API_AUTH_TOKEN_PLACEHOLDER` 代替 |
| 交易类型 | `usdt.bep20`（BSC 链 USDT） |
| 收款地址 | 每个新订单自动派生一个新的 `0x` 地址，**不用**先去「钱包管理」导入地址。文中示例地址是占位值 |
| 默认法币 | `CNY` |
| 单笔金额范围 | 0.01 ~ 99999（法币金额，后台「基本设置」可改） |

对接令牌的位置：后台 → 系统管理 → 基本设置 → API 设置 → 对接令牌。

## 1. 对接流程

```text
你的网站                         BEpusdt                          用户 / 区块链
   │  1. POST /api/v1/order/create-transaction（带签名）  │
   │ ───────────────────────────────▶│                              │
   │  2. 返回 payment_url、token、actual_amount            │
   │ ◀───────────────────────────────│                              │
   │  3. 把用户跳转到 payment_url（收银台直接显示二维码）  │
   │ ─────────────────────────────────────────────────────────────▶│
   │                                 │  4. 用户用 BSC 钱包转 USDT    │
   │                                 │ ◀────────────────────────────│
   │                                 │  5. 扫块匹配订单 → 链上确认   │
   │  6. POST notify_url（status=2，带签名）               │
   │ ◀───────────────────────────────│                              │
   │  7. 校验签名 → 幂等处理 → 返回 HTTP 200 + 正文 ok     │
   │ ───────────────────────────────▶│                              │
   │  8. 用户被跳转到 redirect_url                         │
```

只有两个接口需要你的网站主动调用：

| 接口 | 用途 |
|---|---|
| `POST /api/v1/order/create-transaction` | 创建订单（必须用这个） |
| `POST /api/v1/order/cancel-transaction` | 取消待支付订单（可选） |

## 2. 签名算法

源码在 `app/utils/utils.go` 的 `EpusdtSign`。请求签名和回调签名用的是同一个函数。

1. 取出所有参数，**去掉 `signature`**，去掉值为 `null` 或空字符串 `""` 的参数。
2. 按参数名的 ASCII 字典序升序排序（区分大小写）。
3. 拼成 `key=value`，用 `&` 连接。值不做 URL 编码，中文、`:`、`/` 都保持原样。
4. 在拼接字符串末尾直接追加对接令牌（中间没有 `&`）。
5. 对整个字符串做 MD5，取 **32 位小写十六进制**。

注意：

- 数字参数必须按 JSON 数字发送（`"amount": 100`），不能写成字符串 `"100"`，否则服务端解析失败。
- 数字按 Go 的 `%v` 格式化后参与签名：`100` 签成 `100`，`50.5` 签成 `50.5`，不是 `100.0`。
- 布尔值签成 `true` / `false`。
- 参与签名的是你**最终发送出去**的那些字段，发送什么就签什么。

### 完整示例（可直接核对）

用占位令牌 `YOUR_API_AUTH_TOKEN_PLACEHOLDER`，请求参数：

```json
{
  "order_id": "BEP20-DEMO-0001",
  "amount": 100,
  "fiat": "CNY",
  "trade_type": "usdt.bep20",
  "name": "VIP月卡",
  "rate": "7.2",
  "timeout": 1200,
  "notify_url": "http://127.0.0.1:9000/notify",
  "redirect_url": "http://127.0.0.1:9000/success"
}
```

步骤 1，排序拼接（不含 signature）：

```text
amount=100&fiat=CNY&name=VIP月卡&notify_url=http://127.0.0.1:9000/notify&order_id=BEP20-DEMO-0001&rate=7.2&redirect_url=http://127.0.0.1:9000/success&timeout=1200&trade_type=usdt.bep20
```

步骤 2，末尾追加令牌后做 MD5：

```text
MD5(上面整串 + YOUR_API_AUTH_TOKEN_PLACEHOLDER) = d9cb4c583da35e1e94de9fe03dd74ba2
```

所以用占位令牌时，这个请求的 `signature` 就是 `d9cb4c583da35e1e94de9fe03dd74ba2`。换成你自己的对接令牌后，需要重新计算，得到的才是你的服务能接受的签名。

命令行自己验证：

```bash
printf '%s' 'amount=100&fiat=CNY&name=VIP月卡&notify_url=http://127.0.0.1:9000/notify&order_id=BEP20-DEMO-0001&rate=7.2&redirect_url=http://127.0.0.1:9000/success&timeout=1200&trade_type=usdt.bep20YOUR_API_AUTH_TOKEN_PLACEHOLDER' | md5
# Linux 把 md5 换成 md5sum
```

## 3. 创建订单 `create-transaction`

```http
POST http://127.0.0.1:8080/api/v1/order/create-transaction
Content-Type: application/json
```

**交易类型必须传 `usdt.bep20`。** 不传会默认走 `usdt.trc20`（波场），而你没有配置波场地址，会直接报「usdt.trc20 未检测到可用钱包地址」。

### 请求字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `order_id` | string | 是 | 你网站的订单号，同一个订单号只会对应一个待支付订单 |
| `amount` | number | 否 | 法币金额，如 `100`。范围 0.01~99999。**留空或 `0` 是独占模式**，见[常见坑](#9-常见坑) |
| `trade_type` | string | 本场景必填 | 固定 `usdt.bep20` |
| `fiat` | string | 否 | 法币，默认 `CNY`，可选 `USD` `EUR` `GBP` `JPY` |
| `notify_url` | string | 是 | 支付结果回调地址，**由 BEpusdt 所在机器去请求**，见[回调](#5-回调) |
| `redirect_url` | string | 是 | 支付成功后用户被跳转到的页面 |
| `signature` | string | 是 | 签名，见[签名算法](#2-签名算法) |
| `name` | string | 否 | 商品名称，不传则用 `order_id` |
| `timeout` | number | 否 | 订单有效秒数。有效范围 180~3600，超出范围或不传则用后台配置（默认 1200） |
| `rate` | string | 否 | 单笔指定汇率，写法见[汇率](#4-汇率与实付-usdt-金额) |
| `address` | string | 否 | 指定收款地址。**本场景不要传**，不传才会自动派生新地址 |

### 响应字段

成功时 `status_code` 为 200：

| 字段 | 说明 |
|---|---|
| `data.trade_id` | BEpusdt 的订单号，取消订单、对账都用它 |
| `data.order_id` | 你的订单号 |
| `data.trade_type` | `usdt.bep20` |
| `data.fiat` | 法币类型 |
| `data.amount` | 你传的法币金额（字符串） |
| `data.actual_amount` | 用户实际要付的 USDT 数量，已按汇率换算并保留 2 位小数 |
| `data.token` | 收款地址（BSC 上的 `0x` 地址，大小写混合的校验和格式） |
| `data.status` | 订单状态，创建后为 `1`（待支付） |
| `data.expiration_time` | 订单剩余有效秒数 |
| `data.payment_url` | 收银台链接，把用户重定向过去即可 |

失败时 `status_code` 为 400，`message` 里是原因。

### 响应示例

下面是用上面那组参数下单后返回结果的格式。`trade_id` 和 `token`（收款地址）每个订单都不同，这里的 `token` 是占位地址：

```json
{
  "data": {
    "actual_amount": "13.89",
    "amount": "100",
    "expiration_time": 1199,
    "fiat": "CNY",
    "order_id": "BEP20-DEMO-0001",
    "payment_url": "http://127.0.0.1:8080/pay/checkout/xSB831aAWhbtr8gzvm",
    "status": 1,
    "token": "0x1111111111111111111111111111111111111111",
    "trade_id": "xSB831aAWhbtr8gzvm",
    "trade_type": "usdt.bep20"
  },
  "message": "success",
  "request_id": "",
  "status_code": 200
}
```

`13.89 = 100 ÷ 7.2`，四舍五入到 2 位小数。

### curl 示例

```bash
curl -s -X POST http://127.0.0.1:8080/api/v1/order/create-transaction \
  -H 'Content-Type: application/json' \
  -d '{
    "order_id": "BEP20-DEMO-0001",
    "amount": 100,
    "fiat": "CNY",
    "trade_type": "usdt.bep20",
    "name": "VIP月卡",
    "rate": "7.2",
    "timeout": 1200,
    "notify_url": "http://127.0.0.1:9000/notify",
    "redirect_url": "http://127.0.0.1:9000/success",
    "signature": "d9cb4c583da35e1e94de9fe03dd74ba2"
  }'
```

如果你把 `order_id` 换成别的，`signature` 要重新算，用下面的代码最方便。

### Python 下单代码（只依赖标准库）

保存为 `create_order.py`，把 `TOKEN` 和 `BASE` 换成你自己的对接令牌和 BEpusdt 地址后运行：`python3 create_order.py`。

```python
import hashlib
import json
import time
import urllib.request

BASE = "http://127.0.0.1:8080"
TOKEN = "YOUR_API_AUTH_TOKEN_PLACEHOLDER"  # 占位符，换成后台里你自己的对接令牌，不要提交到代码仓库


def fmt(v):
    # 与 Go 的 %v 对齐：布尔转小写，整数值的浮点数不带 .0
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, float) and v == int(v):
        return str(int(v))
    return str(v)


def sign(params, token):
    pairs = []
    for k in sorted(params):
        v = params[k]
        if k == "signature" or v is None or v == "":
            continue
        pairs.append(k + "=" + fmt(v))
    return hashlib.md5(("&".join(pairs) + token).encode("utf-8")).hexdigest()


def post(path, body):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def create_order(order_id, amount, name):
    body = {
        "order_id": order_id,
        "amount": amount,  # 必须是 JSON 数字，不能是字符串
        "fiat": "CNY",
        "trade_type": "usdt.bep20",
        "name": name,
        "timeout": 1200,
        "notify_url": "http://127.0.0.1:9000/notify",
        "redirect_url": "http://127.0.0.1:9000/success",
    }
    body["signature"] = sign(body, TOKEN)
    return post("/api/v1/order/create-transaction", body)


def cancel_order(trade_id):
    body = {"trade_id": trade_id}
    body["signature"] = sign(body, TOKEN)
    return post("/api/v1/order/cancel-transaction", body)


if __name__ == "__main__":
    res = create_order("PY" + str(int(time.time())), 100, "VIP月卡")
    print(json.dumps(res, ensure_ascii=False, indent=2))
    if res.get("status_code") == 200:
        print("请让用户打开：", res["data"]["payment_url"])
```

### PHP 下单代码

保存为 `create_order.php`，`php create_order.php` 即可运行，需要 `curl` 扩展。

```php
<?php
const BASE = 'http://127.0.0.1:8080';
const TOKEN = 'YOUR_API_AUTH_TOKEN_PLACEHOLDER'; // 占位符，换成后台里你自己的对接令牌，不要提交到代码仓库

function fmtVal($v) {
    if (is_bool($v)) return $v ? 'true' : 'false';
    return (string)$v;
}

function sign(array $params, string $token): string {
    ksort($params, SORT_STRING);
    $pairs = [];
    foreach ($params as $k => $v) {
        if ($k === 'signature' || $v === null || $v === '') continue;
        $pairs[] = $k . '=' . fmtVal($v);
    }
    return md5(implode('&', $pairs) . $token);
}

function post(string $path, array $body): array {
    $ch = curl_init(BASE . $path);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
    ]);
    $out = curl_exec($ch);
    curl_close($ch);
    return json_decode($out, true);
}

$body = [
    'order_id'     => 'PHP' . time(),
    'amount'       => 100,            // 必须是数字，不能是字符串
    'fiat'         => 'CNY',
    'trade_type'   => 'usdt.bep20',
    'name'         => 'VIP月卡',
    'timeout'      => 1200,
    'notify_url'   => 'http://127.0.0.1:9000/notify',
    'redirect_url' => 'http://127.0.0.1:9000/success',
];
$body['signature'] = sign($body, TOKEN);

$res = post('/api/v1/order/create-transaction', $body);
echo json_encode($res, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), PHP_EOL;
if (($res['status_code'] ?? 0) === 200) {
    echo '请让用户打开：', $res['data']['payment_url'], PHP_EOL;
}
```

## 4. 汇率与实付 USDT 金额

公式：`actual_amount = amount ÷ 汇率`，四舍五入保留 2 位小数（USDT 的最小订单精度是 `0.01`，由后台配置 `atom_usdt` 决定）。

汇率有三层来源，优先级从高到低：

1. **单笔下单传 `rate`**：只对这一单生效。
2. **后台固定汇率**：后台 → 汇率监控 → 汇率配置，给 `USDT / CNY` 填一个固定数字（如 `7.2`）或浮动写法。
3. **自动同步的市场汇率**：BEpusdt 定时从 CoinGecko 拉取，本地当前 `USDT/CNY` 是 `6.67`。

`rate` 参数（单笔）和后台配置（全局）使用同一套写法：

| 写法 | 含义 | 基准汇率 6.67 时的结果（实测） |
|---|---|---|
| `"7.2"` | 固定汇率 7.2 | `100 ÷ 7.2 = 13.89` |
| `"~1.02"` | 市场汇率乘以 1.02（上浮 2%） | `100 ÷ (6.67×1.02) = 14.7` |
| `"~0.97"` | 市场汇率乘以 0.97（下浮 3%） | |
| `"+0.3"` | 市场汇率加 0.3 | `100 ÷ (6.67+0.3) = 14.35` |
| `"-0.2"` | 市场汇率减 0.2 | |

要点：

- `rate` 要用**字符串**传（`"7.2"`），并且参与签名。
- 后台配置的汇率，是在下一次汇率同步时写入新的汇率记录。保存后点一下汇率监控里的「立刻同步」，再到「同步记录」里看「订单汇率」列确认已变成你设置的值（这一条是按 `app/model/rate.go` 的 `BeforeCreate` 推断，上线时请在后台自己确认一次）。
- 想让网站价格和 USDT 严格按 1 USD = 1 USDT 之类的固定关系走，直接用固定数字最省事。
- 汇率同步失败或没有对应币种的汇率记录时，下单会报「创建失败，请检查汇率同步是否正常」。

## 5. 回调

### 谁请求谁

BEpusdt 所在机器会主动向你下单时填写的 `notify_url` 发送 `POST` 请求，请求体是 JSON，超时 5 秒。你的网站是接收方。

`notify_url` 的限制（源码 `utils.IsAllowedCallbackURL`）：只检查「是合法 URL、协议是 `http` 或 `https`、主机名不为空」。不会拦截内网地址或 `127.0.0.1`，所以这些地址下单能成功，但是否真能收到要看网络：

- `127.0.0.1` / `localhost` 指的是 **BEpusdt 自己所在的机器（容器）**。网站和 BEpusdt 不在同一台机器、或任何一方在 Docker 里时，填 `127.0.0.1` 会收不到回调。
- 线上请填 BEpusdt 能访问到的公网域名，如 `https://shop.example.com/notify`，不要填只有你自己浏览器能打开的地址。
- `redirect_url` 是用户浏览器跳转用的，只需要用户能打开。

### 回调内容

```json
{
  "trade_id": "OnwCvzZEJQfv1LM0gm",
  "order_id": "PY1794036073",
  "amount": 100,
  "actual_amount": "14.99",
  "token": "0x1111111111111111111111111111111111111111",
  "block_transaction_id": "0xabababababababababababababababababababababababababababababababab",
  "signature": "1a7ff8a695f722156972c6808c7a26d6",
  "status": 2
}
```

这是回调的格式示例（`status=2`）。其中收款地址和 `block_transaction_id`（一串演示用的 `ab`）都是占位值，真实回调里是订单的收款地址和 BSC 交易哈希。

| 字段 | 类型 | 说明 |
|---|---|---|
| `trade_id` | string | BEpusdt 订单号 |
| `order_id` | string | 你的订单号 |
| `amount` | number | 订单法币金额 |
| `actual_amount` | string | 实际支付的 USDT 数量，**是字符串** |
| `token` | string | 收款地址 |
| `block_transaction_id` | string | 链上交易哈希。待支付和超时的回调里这里不是哈希，不要当哈希用 |
| `status` | number | 订单状态，见下表 |
| `signature` | string | 回调签名，算法与请求签名相同 |

### status 含义

| status | 含义 | 你该怎么做 |
|---|---|---|
| `1` | 等待支付 | **不是已付款。** 忽略即可，返回 `ok` |
| `2` | 支付成功 | 给用户加款/发货 |
| `3` | 订单超时 | 把你的订单标记为已过期 |
| `6` | 链上确认失败（少见） | 按未支付处理 |

`status=1` 的回调是 BEpusdt 对待支付订单大约每 30 秒推送一次（同一状态 1 分钟内去重），只有代码里把 `status` 当成「有回调就算付款」才会出问题。**必须判断 `status == 2` 才能发货。**

### 你的接口必须怎么响应

- 处理成功：返回 **HTTP 200**，正文写 **`ok`**。
- 签名校验失败或处理失败：返回非 200 状态码。
- 说明：对 `create-transaction` 创建的订单，BEpusdt 判断回调成功的依据只有 HTTP 状态码是 200，不检查正文。仍然建议正文返回 `ok`，这是通用约定，也兼容别的 Epusdt 系对接代码。

### 重试规则

只有 `status=2` 的回调会重试：

- 订单确认成功后立刻发第 1 次。
- 失败（非 200、超时、连不上）后，按 `订单确认时间 + 2^n 分钟` 计算下一次时间（n 是已失败次数，所以约为确认后 2、4、8、16……分钟），每 3 秒扫描一次到期的订单。
- 最多重试 `notify_max_retry` 次，后台默认 10。
- 超过次数后不再自动回调，后台「交易订单」里可以手动补发回调。

`status=1`、`status=3` 的回调只发送，不重试。

### 幂等

同一笔订单可能收到多次 `status=2` 回调（你的 200 响应丢了、重试等）。按下面处理：

1. 用 `trade_id` 或 `order_id` 做唯一键，发货前先检查订单是否已处理。
2. 已经处理过，直接返回 `ok`，不要报错，也不要重复加款。
3. 核对 `actual_amount` 与你记录的这笔订单金额是否一致，不一致先别发货，人工确认。

### 校验回调签名

回调签名和请求签名是同一个算法，用同一个对接令牌：把请求体里除 `signature` 以外的字段按名称排序、拼接、追加令牌、MD5，和 `signature` 比较。

对照：上面那条回调体，用占位令牌 `YOUR_API_AUTH_TOKEN_PLACEHOLDER` 算出的签名就是 `1a7ff8a695f722156972c6808c7a26d6`。如果你的服务用的是真实令牌，请先把令牌换成你自己的并重新计算签名，再把这个 JSON POST 给 `http://127.0.0.1:8080/api/v1/pay/notify`，服务端会返回 `ok`（签名正确）或 `fail`（签名错误），可以拿来核对你的签名代码：

```bash
curl -s -X POST http://127.0.0.1:8080/api/v1/pay/notify \
  -H 'Content-Type: application/json' \
  -d '{"trade_id":"OnwCvzZEJQfv1LM0gm","order_id":"PY1794036073","amount":100,"actual_amount":"14.99","token":"0x1111111111111111111111111111111111111111","block_transaction_id":"0xabababababababababababababababababababababababababababababababab","signature":"1a7ff8a695f722156972c6808c7a26d6","status":2}'
# 签名正确返回 ok，错误返回 fail
```

### Python 回调接收示例

保存为 `notify_server.py`，`python3 notify_server.py` 启动，监听 9000 端口。已在本地实测：BEpusdt 真实回调到它，签名校验通过，返回 `ok` 后订单的回调状态变为成功。

```python
import hashlib
import json
from http.server import BaseHTTPRequestHandler, HTTPServer

TOKEN = "YOUR_API_AUTH_TOKEN_PLACEHOLDER"  # 占位符，换成后台里你自己的对接令牌，不要提交到代码仓库
PAID = set()  # 演示用内存集合；生产请用数据库唯一索引或订单状态做幂等


def fmt(v):
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, float) and v == int(v):
        return str(int(v))
    return str(v)


def sign(params, token):
    pairs = []
    for k in sorted(params):
        v = params[k]
        if k == "signature" or v is None or v == "":
            continue
        pairs.append(k + "=" + fmt(v))
    return hashlib.md5(("&".join(pairs) + token).encode("utf-8")).hexdigest()


class Handler(BaseHTTPRequestHandler):
    def _reply(self, code, text):
        data = text.encode()
        self.send_response(code)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.path != "/notify":
            return self._reply(404, "not found")
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
        if sign(body, TOKEN) != body.get("signature"):
            return self._reply(400, "bad signature")  # 非 200，BEpusdt 会重试
        print("收到回调", body, flush=True)
        if body["status"] == 2 and body["trade_id"] not in PAID:
            PAID.add(body["trade_id"])
            # 在这里给 body["order_id"] 对应的订单加款/发货，金额以 actual_amount 为准
        return self._reply(200, "ok")  # 重复回调也返回 ok

    def do_GET(self):
        self._reply(200, "支付成功页")


HTTPServer(("0.0.0.0", 9000), Handler).serve_forever()
```

### PHP 回调接收示例

保存为 `notify.php`，用 `php -S 0.0.0.0:9000 notify.php` 启动。

```php
<?php
// 启动：php -S 0.0.0.0:9000 notify.php
const TOKEN = 'YOUR_API_AUTH_TOKEN_PLACEHOLDER'; // 占位符，换成后台里你自己的对接令牌，不要提交到代码仓库

function sign(array $params, string $token): string {
    ksort($params, SORT_STRING);
    $pairs = [];
    foreach ($params as $k => $v) {
        if ($k === 'signature' || $v === null || $v === '') continue;
        $pairs[] = $k . '=' . (is_bool($v) ? ($v ? 'true' : 'false') : (string)$v);
    }
    return md5(implode('&', $pairs) . $token);
}

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($path !== '/notify' || $_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo '支付成功页';
    return;
}

$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body) || !hash_equals(sign($body, TOKEN), (string)($body['signature'] ?? ''))) {
    http_response_code(400); // 非 200，BEpusdt 会重试
    echo 'bad signature';
    return;
}

if ((int)$body['status'] === 2) {
    // 幂等：用 trade_id 做唯一键，已处理过就直接返回 ok
    // 例：INSERT ... ON DUPLICATE KEY / 先查订单状态再更新为已支付
    // 给 $body['order_id'] 对应订单加款/发货，金额以 actual_amount 为准
    error_log('paid ' . $body['trade_id'] . ' ' . $body['actual_amount']);
}
echo 'ok'; // 重复回调也返回 ok
```

## 6. 响应字段怎么用

| 字段 | 用法 |
|---|---|
| `payment_url` | **直接重定向用户过去。** 因为下单时已经指定了 `usdt.bep20`，收银台会直接显示二维码和收款信息，不会让用户选链、选币。 |
| `token` | 收款地址。需要在你自己的页面展示收款信息时，展示它。务必告诉用户是 **BSC（BEP20）网络**。 |
| `actual_amount` | 用户必须付的 USDT 数量。默认匹配模式是精确匹配，付多或付少都会匹配不上订单，所以自己的页面要原样展示这个数。 |
| `amount` | 订单法币金额，对账用。 |
| `expiration_time` | 订单剩余秒数（按响应时刻计），可以用来做倒计时。到点后订单过期，BEpusdt 会发 `status=3` 回调。 |
| `trade_id` | BEpusdt 订单号，取消订单和日后查账都靠它，建议落库。 |

`payment_url` 的域名取自你调用 BEpusdt 时请求头里的 `Host`。你用 `http://127.0.0.1:8080` 调用，返回的就是 `http://127.0.0.1:8080/pay/checkout/...`，用户的手机打不开。线上请让网站后端通过 BEpusdt 的公网域名调用，并让反向代理透传 `Host` 和 `X-Forwarded-Proto`，这样返回的才是 `https://你的域名/pay/checkout/...`。

## 7. 取消订单 `cancel-transaction`

```http
POST http://127.0.0.1:8080/api/v1/order/cancel-transaction
Content-Type: application/json
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `trade_id` | 是 | 下单返回的 `trade_id` |
| `signature` | 是 | 对 `trade_id` 签名 |

签名示例：`trade_id=xSB831aAWhbtr8gzvm` 追加令牌后的 MD5 是 `9ab02a2e595337578b10db3e4569bded`。

```bash
curl -s -X POST http://127.0.0.1:8080/api/v1/order/cancel-transaction \
  -H 'Content-Type: application/json' \
  -d '{"trade_id":"xSB831aAWhbtr8gzvm","signature":"9ab02a2e595337578b10db3e4569bded"}'
```

成功响应（实测）：

```json
{"data":{"trade_id":"xSB831aAWhbtr8gzvm"},"message":"success","request_id":"","status_code":200}
```

规则（实测 + 源码）：

- 只有「待支付」订单能取消，已支付、已过期、已取消的订单会返回 `当前订单(xxx)状态不允许取消`（`status_code` 400）。
- 取消不会触发回调，你的网站在调用成功后自己把订单标记为已取消。
- 同一个 `order_id` 取消之后可以再次下单，会分配新的订单和新的收款地址。

Python 里直接用上面 `create_order.py` 里的 `cancel_order(trade_id)`。

## 8. 同一个订单号重复下单

用同一个 `order_id` 再次调用 `create-transaction`：

- 订单已支付或链上确认中：直接返回原订单，不会重建。
- 订单还是待支付，且 `order_id`、交易类型、金额、法币都没变：返回原订单，`trade_id` 和收款地址不变，**超时时间也不会重置**（实测 `expiration_time` 从 1199 降到了 1179）。
- 订单还是待支付，但金额、法币等变了：保留原来的 `trade_id` 和收款地址，更新金额和有效期（实测金额从 100 改成 50.5 后，`actual_amount` 变成 `7.01`，地址不变）。

所以网站的「重新支付」按钮可以直接重新调用下单，不会浪费收款地址。

## 9. 常见坑

1. **不要用 `create-order`。** 它创建的是「让用户自己选链和币」的收银台订单，会进入选择页。本场景只用 `create-transaction`。
2. **一定要传 `trade_type=usdt.bep20`。** 不传默认是 `usdt.trc20`，没有波场地址会直接报错；有波场地址时则会让用户去付波场 USDT，付到别的链上的钱无法匹配订单。
3. **`amount` 为 `0` 或不传是独占模式。** 任意金额到账都会触发回调，回调里的金额是实际到账金额，且不受 0.01~99999 的金额范围限制。网站商品订单一定要传大于 0 的金额。
4. **`amount` 必须是 JSON 数字。** 写成 `"100"` 会解析失败。PHP 里算出来的小数要先 `round($x, 2)` 再发，避免 `0.1+0.2` 这类浮点误差让签名对不上。
5. **回调里 `status=1` 不是付款。** 只有 `status=2` 才能发货。
6. **`notify_url` 写 `127.0.0.1` 只在网站和 BEpusdt 同机时有效。** 容器、跨机器都不行。
7. **联调时不要用真钱，也不要用有真实资产的助记词。** 开发联调请用单独生成的测试助记词。文中示例里的 `0x` 地址是占位值，不要向它们转账。真实订单的收款地址由你配置的助记词派生，资金只有持有这份助记词的人才能取出，务必离线备份。
8. **BSC 节点必须支持 `eth_getLogs`，否则监听不到 USDT 到账。** 默认节点是 `https://bsc.blockrazor.xyz`。BEpusdt 靠 `eth_getLogs` 取 USDT 的 Transfer 事件来识别付款，每次查询 10 个区块且不带合约地址过滤。实测官方 dataseed 系列（`bsc-dataseed*.bnbchain.org`、`bsc-dataseed.binance.org`、`bsc-dataseed.defibit.io`、`bsc-dataseed.ninicoin.io` 等）对 `eth_getLogs` 一律返回 `limit exceeded`，`bsc.publicnode.com` 只允许单块查询、10 块会要求指定地址，都不能用来扫 USDT。公共节点有限速，正式上线建议换成自建节点或带 key 的服务商节点（后台 → 系统管理 → 区块节点），并用一笔小额真实转账验证订单能变成已支付。
9. **用户付款金额必须是 `actual_amount`。** 默认精确匹配，少付或多付都对不上订单。
10. **对接令牌不要放进前端页面或日志。** 签名必须在你网站后端完成。

## 10. 上线前检查

- [ ] 把 `http://127.0.0.1:8080` 换成 BEpusdt 的正式域名（HTTPS），并保证反向代理透传 `Host` 和 `X-Forwarded-Proto`。
- [ ] **重置对接令牌**：后台 → 系统管理 → 基本设置 → API 设置，重置后把新令牌换到你网站的配置里。文档里的 `YOUR_API_AUTH_TOKEN_PLACEHOLDER` 只是占位符，务必换成你自己的令牌，并且不要把真实令牌提交到代码仓库。
- [ ] 后台配置可用的 BSC RPC 节点。
- [ ] 确认 `HD_TRADE_TYPES` 包含 `usdt.bep20`，`HD_MNEMONIC` 只放在服务器环境变量里，并离线备份。
- [ ] 确认汇率：在汇率监控里看 `USDT/CNY`，需要固定汇率就在汇率配置里设置。
- [ ] `notify_url` 是公网可访问的 HTTPS 地址，接口做了签名校验和幂等。
- [ ] 手续费地址（助记词 index 0，也就是钱包里第一个账户）里预留一些 BNB，建议起步 0.01 BNB 以上，见[资金归集](#11-资金归集)。
- [ ] 用一笔很小的真实金额完整走一遍：下单 → 付款 → 回调 → 发货。

## 11. 资金归集

每个订单收款用的是一个单独的新地址，所以付款会分散在很多地址里。BEpusdt 会在订单链上确认成功后，自动把该地址里的 USDT 转到你自己的主地址，你不需要手动在 MetaMask / Trust Wallet 里创建账户再转出。

- **转到哪里**：默认转到同一套助记词的 `m/44'/60'/0'/0/0`，也就是 MetaMask / Trust Wallet 里导入这套助记词后看到的第一个账户。想转到别的地址，用环境变量 `HD_COLLECT_ADDRESS` 指定。
- **需要 BNB**：派生地址上只有 USDT，转出需要 BNB 手续费。BEpusdt 会先从 index 0 这个地址给派生地址打一小笔 BNB，确认后再转 USDT，转完把剩余的 BNB 转回来。所以 **index 0 地址里必须预留 BNB**，建议起步 0.01 BNB 以上，每单大约消耗 0.0001 到 0.0005 BNB（估算值，随链上 gas 价格变化）。
- **BNB 不够时**：日志会出现「主地址 BNB 不足，请先向主地址 0x… 打入一些 BNB 作手续费」，该订单的归集会等待，每 5 分钟重试一次，充值后自动继续。订单收款和回调不受影响。
- **开关**：配置了 `HD_MNEMONIC`，并且 `HD_TRADE_TYPES` 包含 `usdt.bep20` 时自动开启。设置 `HD_SWEEP_ENABLED=false` 可以关闭。`HD_SWEEP_GAS_BNB` 可以限制单次补给手续费的上限。
- **前提**：后台「区块节点」里的 BSC 节点必须可用，归集要通过它发送交易。节点需要支持 `eth_getLogs`，见[常见坑](#9-常见坑)第 8 条。
- **查看状态**：后台菜单「归集记录」，能看到每个订单的归集状态、补给/归集/回收交易哈希、失败原因，页面顶部会显示归集目标地址和手续费地址。状态为「失败」的记录有「重试」按钮。
- **不会发生的事**：后台人工「补单」不会触发归集；程序不会为已有的历史订单补做归集；同一笔订单不会被重复转走。

完整的环境变量和状态说明见 [`docs/hd-wallet.md`](./hd-wallet.md)。

