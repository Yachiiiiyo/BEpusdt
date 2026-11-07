package auth

import "testing"

func TestValidateSecure(t *testing.T) {
	var cases = []struct {
		secure string
		want   string
	}{
		{"", ""},
		{"/admin123", ""},
		{"admin123", "安全入口必须以 / 开头"},
		{"/abc", "安全入口长度需为8-18位"},
		{"/abcdefghijklmnopqrstuvwxyz", "安全入口长度需为8-18位"},
		{"/admin_12", "安全入口只能包含字母和数字"},
		{"/管理入口123", "安全入口只能包含字母和数字"},
	}

	for _, c := range cases {
		if got := validateSecure(c.secure); got != c.want {
			t.Errorf("validateSecure(%q) = %q, want %q", c.secure, got, c.want)
		}
	}
}

func TestValidateNewPassword(t *testing.T) {
	var cases = []struct {
		name    string
		newPwd  string
		confirm string
		change  bool
		want    string
	}{
		{"不改密码", "", "", false, ""},
		{"新密码为空确认不为空", "", "abc123", true, "两次输入的新密码不一致"},
		{"两次不一致", "abc123", "abc124", true, "两次输入的新密码不一致"},
		{"少于6位", "abc12", "abc12", true, "新密码长度不能少于6位"},
		{"正常", "abc123", "abc123", true, ""},
		{"中文密码", "六位汉字密码", "六位汉字密码", true, ""},
	}

	for _, c := range cases {
		if got := validateNewPassword(c.newPwd, c.confirm, c.change); got != c.want {
			t.Errorf("%s: validateNewPassword(%q, %q, %v) = %q, want %q", c.name, c.newPwd, c.confirm, c.change, got, c.want)
		}
	}

	var raw = make([]byte, 73)
	for i := range raw {
		raw[i] = 'a'
	}
	var long = string(raw)
	if got := validateNewPassword(long, long, true); got != "新密码过长（bcrypt 最多 72 字节，约 72 个英文字符或 24 个汉字），请缩短后重试" {
		t.Errorf("超长密码: got %q", got)
	}
}
