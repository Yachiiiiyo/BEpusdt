package auth

import (
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
	"github.com/spf13/cast"
	"github.com/v03413/bepusdt/app/conf"
	"github.com/v03413/bepusdt/app/handler/base"
	"github.com/v03413/bepusdt/app/model"
	"github.com/v03413/bepusdt/app/utils"
	"github.com/v03413/go-cache"
	"golang.org/x/crypto/bcrypt"
)

type Auth struct {
}

var securePathRe = regexp.MustCompile(`^/[a-zA-Z0-9]+$`)

type authLoginReq struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type authPasswordReq struct {
	Password        string `json:"password"`
	NewPassword     string `json:"new_password"`
	ConfirmPassword string `json:"confirm_password"`
}

type authSecurityReq struct {
	AdminSecure     string `json:"admin_secure"`
	AdminUsername   string `json:"admin_username"`
	Password        string `json:"password"`
	NewPassword     string `json:"new_password"`
	ConfirmPassword string `json:"confirm_password"`
}

func (Auth) Info(ctx *gin.Context) {
	base.Ok(ctx, gin.H{
		"admin_username": model.GetK(model.AdminUsername),
		"trade_type":     model.GetAllAlias(),
		"trade_fiat":     model.GetSupportFiat(),
		"trade_crypto":   model.GetSupportCrypto(),
		"trade_network":  model.GetAllNetwork(),
	})
}

func (Auth) Menu(ctx *gin.Context) {
	type meta struct {
		Title     string   `json:"title"`
		Hide      bool     `json:"hide"`
		Disable   bool     `json:"disable"`
		KeepAlive bool     `json:"keepAlive"`
		Affix     bool     `json:"affix"`
		Link      string   `json:"link"`
		Iframe    bool     `json:"iframe"`
		IsFull    bool     `json:"isFull"`
		Roles     []string `json:"roles"`
		SvgIcon   string   `json:"svgIcon"`
		Icon      string   `json:"icon"`
		Sort      int      `json:"sort"`
		Type      int      `json:"type"`
	}
	type menu struct {
		Id        string `json:"id"`
		ParentId  string `json:"parentId"`
		Path      string `json:"path"`
		Name      string `json:"name"`
		Component string `json:"component"`
		Meta      meta   `json:"meta"`
		Children  []menu `json:"children"`
	}

	var data = []menu{
		{
			Id:        "01",
			Path:      "/home",
			Name:      "home",
			Component: "home/home",
			Meta: meta{
				Title:     "home",
				Hide:      false,
				Disable:   false,
				KeepAlive: false,
				Affix:     true,
				Link:      "",
				Iframe:    false,
				IsFull:    false,
				Roles:     []string{"admin"},
				SvgIcon:   "home",
				Icon:      "",
				Sort:      1,
				Type:      2,
			},
			Children: nil,
		},
		{
			Id:        "02",
			Path:      "/wallet",
			Name:      "wallet",
			Component: "wallet/wallet",
			Meta: meta{
				Title:     "wallet",
				Hide:      false,
				Disable:   false,
				KeepAlive: true,
				Affix:     false,
				Link:      "",
				Iframe:    false,
				IsFull:    false,
				Roles:     []string{"admin"},
				SvgIcon:   "classify",
				Icon:      "",
				Sort:      1,
				Type:      2,
			},
			Children: nil,
		},
		{
			Id:        "03",
			Path:      "/order",
			Name:      "order",
			Component: "order/order",
			Meta: meta{
				Title:     "order",
				Hide:      false,
				Disable:   false,
				KeepAlive: true,
				Affix:     false,
				Link:      "",
				Iframe:    false,
				IsFull:    false,
				Roles:     []string{"admin"},
				SvgIcon:   "table",
				Icon:      "",
				Sort:      1,
				Type:      2,
			},
			Children: nil,
		},
		{
			Id:        "04",
			Path:      "/rate",
			Name:      "rate",
			Component: "rate/rate",
			Meta: meta{
				Title:     "rate",
				Hide:      false,
				Disable:   false,
				KeepAlive: true,
				Affix:     false,
				Link:      "",
				Iframe:    false,
				IsFull:    false,
				Roles:     []string{"admin"},
				SvgIcon:   "directives",
				Icon:      "",
				Sort:      1,
				Type:      1,
			},
			Children: []menu{
				{
					Id:        "0401",
					ParentId:  "04",
					Path:      "/rate/list",
					Name:      "rate-list",
					Component: "rate/list",
					Meta: meta{
						Title:     "rate-list",
						Hide:      false,
						Disable:   false,
						KeepAlive: true,
						Affix:     false,
						Link:      "",
						Iframe:    false,
						IsFull:    false,
						Roles:     []string{"admin"},
						SvgIcon:   "",
						Icon:      "icon-list",
						Sort:      1,
						Type:      2,
					},
					Children: nil,
				},
				{
					Id:        "0402",
					ParentId:  "04",
					Path:      "/rate/syntax",
					Name:      "rate-syntax",
					Component: "rate/syntax",
					Meta: meta{
						Title:     "rate-syntax",
						Hide:      false,
						Disable:   false,
						KeepAlive: true,
						Affix:     false,
						Link:      "",
						Iframe:    false,
						IsFull:    false,
						Roles:     []string{"admin"},
						SvgIcon:   "",
						Icon:      "icon-settings",
						Sort:      1,
						Type:      2,
					},
					Children: nil,
				},
			},
		},
		{
			Id:        "05",
			Path:      "/system",
			Name:      "system",
			Component: "system/system",
			Meta: meta{
				Title:     "system",
				Hide:      false,
				Disable:   false,
				KeepAlive: true,
				Affix:     false,
				Link:      "",
				Iframe:    false,
				IsFull:    false,
				Roles:     []string{"admin"},
				SvgIcon:   "set",
				Icon:      "",
				Sort:      1,
				Type:      1,
			},
			Children: []menu{
				{
					Id:        "0501",
					ParentId:  "05",
					Path:      "/system/base/base",
					Name:      "system-base",
					Component: "system/base/base",
					Meta: meta{
						Title:     "system-base",
						Hide:      false,
						Disable:   false,
						KeepAlive: true,
						Affix:     false,
						Link:      "",
						Iframe:    false,
						IsFull:    false,
						Roles:     []string{"admin"},
						SvgIcon:   "",
						Icon:      "icon-layers",
						Sort:      1,
						Type:      2,
					},
					Children: nil,
				},
				{
					Id:        "0502",
					ParentId:  "05",
					Path:      "/system/rpc/rpc",
					Name:      "system-rpc",
					Component: "system/rpc/rpc",
					Meta: meta{
						Title:     "system-rpc",
						Hide:      false,
						Disable:   false,
						KeepAlive: true,
						Affix:     false,
						Link:      "",
						Iframe:    false,
						IsFull:    false,
						Roles:     []string{"admin"},
						SvgIcon:   "",
						Icon:      "icon-thunderbolt",
						Sort:      1,
						Type:      2,
					},
					Children: nil,
				},
			},
		},
		{
			Id:        "06",
			Path:      "/create-order",
			Name:      "create-order",
			Component: "order/create-order",
			Meta: meta{
				Title:     "create-order",
				Hide:      false,
				Disable:   false,
				KeepAlive: true,
				Affix:     false,
				Link:      "",
				Iframe:    false,
				IsFull:    false,
				Roles:     []string{"admin"},
				SvgIcon:   "form",
				Icon:      "",
				Sort:      1,
				Type:      2,
			},
			Children: nil,
		},
		{
			Id:        "07",
			Path:      "/github-api-doc",
			Name:      "github-api-doc",
			Component: "about/doc",
			Meta: meta{
				Title:     "github-api-doc",
				Hide:      false,
				Disable:   false,
				KeepAlive: true,
				Affix:     false,
				Link:      "",
				Iframe:    false,
				IsFull:    false,
				Roles:     []string{"admin"},
				SvgIcon:   "about",
				Icon:      "",
				Sort:      1,
				Type:      2,
			},
		},
		{
			Id:        "08",
			Path:      "/sweep",
			Name:      "sweep",
			Component: "sweep/sweep",
			Meta: meta{
				Title:     "sweep",
				Hide:      false,
				Disable:   false,
				KeepAlive: true,
				Affix:     false,
				Link:      "",
				Iframe:    false,
				IsFull:    false,
				Roles:     []string{"admin"},
				SvgIcon:   "financial-statement",
				Icon:      "",
				Sort:      1,
				Type:      2,
			},
			Children: nil,
		},
	}

	base.Ok(ctx, data)
}

func (Auth) Login(ctx *gin.Context) {
	var req authLoginReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		base.Response(ctx, 400, "请输入用户名和密码")

		return
	}

	var username = model.GetK(model.AdminUsername)
	if strings.TrimSpace(req.Username) != strings.TrimSpace(username) {
		base.Response(ctx, 400, "用户名或密码错误")

		return
	}

	var password = model.GetK(model.AdminPassword)
	if bcrypt.CompareHashAndPassword([]byte(password), []byte(req.Password)) != nil {
		base.Response(ctx, 400, "用户名或密码错误")

		return
	}

	rand, _ := utils.GenerateTradeId()

	var token = utils.StrSha256(rand + ctx.ClientIP())

	cache.Set(conf.AdminTokenK, token, time.Hour*24)

	model.SetK(model.AdminLoginIP, ctx.ClientIP())
	model.SetK(model.AdminLoginAt, cast.ToString(time.Now().Format(time.DateTime)))

	base.Response(ctx, 200, gin.H{"token": token, "types": model.GetAllAlias()})
}

func (Auth) Logout(ctx *gin.Context) {
	cache.Set(conf.AdminTokenK, "", -1)

	sess := sessions.Default(ctx)
	sess.Delete(conf.AdminSecureK)
	_ = sess.Save()

	base.Response(ctx, 200, "退出成功")
}

func (Auth) SetPassword(ctx *gin.Context) {
	var req authPasswordReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		base.BadRequest(ctx, "请求参数格式错误")

		return
	}

	relogin, err := applySecurity(ctx, "", "", req.Password, req.NewPassword, req.ConfirmPassword)
	if err != nil {
		return
	}

	if relogin {
		base.Response(ctx, 200, gin.H{"relogin": true})

		return
	}

	base.Ok(ctx, "设置保存成功")
}

func (Auth) Security(ctx *gin.Context) {
	var req authSecurityReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		base.BadRequest(ctx, "请求参数格式错误")

		return
	}

	var username = strings.TrimSpace(req.AdminUsername)
	if username == "" {
		base.BadRequest(ctx, "管理账号不能为空")

		return
	}

	relogin, err := applySecurity(ctx, username, strings.TrimSpace(req.AdminSecure), req.Password, req.NewPassword, req.ConfirmPassword)
	if err != nil {
		return
	}

	if relogin {
		base.Response(ctx, 200, gin.H{"relogin": true})

		return
	}

	base.Response(ctx, 200, gin.H{"relogin": false})
}

func applySecurity(ctx *gin.Context, username, secure, password, newPassword, confirm string) (bool, error) {
	if err := validateSecure(secure); err != "" {
		base.BadRequest(ctx, err)

		return false, errors.New(err)
	}

	if password == "" {
		base.BadRequest(ctx, "请输入当前密码")

		return false, errors.New("请输入当前密码")
	}

	var oldPassword = model.GetK(model.AdminPassword)
	if bcrypt.CompareHashAndPassword([]byte(oldPassword), []byte(password)) != nil {
		base.BadRequest(ctx, "当前密码错误")

		return false, errors.New("当前密码错误")
	}

	var changePassword = newPassword != "" || confirm != ""
	if err := validateNewPassword(newPassword, confirm, changePassword); err != "" {
		base.BadRequest(ctx, err)

		return false, errors.New(err)
	}

	var hash []byte
	if changePassword {
		var err error
		hash, err = bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
		if err != nil {
			base.BadRequest(ctx, "密码加密失败，请稍后重试")

			return false, err
		}
	}

	if username != "" && username != model.GetK(model.AdminUsername) {
		model.SetK(model.AdminUsername, username)
	}
	if secure != "" && secure != model.GetK(model.AdminSecure) {
		model.SetK(model.AdminSecure, secure)
	}

	if changePassword {
		model.SetK(model.AdminPassword, string(hash))
		cache.Set(conf.AdminTokenK, "", -1)

		return true, nil
	}

	return false, nil
}

func validateSecure(secure string) string {
	if secure == "" {
		return ""
	}
	if !strings.HasPrefix(secure, "/") {
		return "安全入口必须以 / 开头"
	}
	if len(secure) < 8 || len(secure) > 18 {
		return "安全入口长度需为8-18位"
	}
	if !securePathRe.MatchString(secure) {
		return "安全入口只能包含字母和数字"
	}

	return ""
}

func validateNewPassword(newPassword, confirm string, change bool) string {
	if !change {
		return ""
	}
	if newPassword != confirm {
		return "两次输入的新密码不一致"
	}
	if len(newPassword) < 6 {
		return "新密码长度不能少于6位"
	}
	if len(newPassword) > 72 {
		return "新密码过长（bcrypt 最多 72 字节，约 72 个英文字符或 24 个汉字），请缩短后重试"
	}

	return ""
}
