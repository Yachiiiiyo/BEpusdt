package notifier

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/v03413/bepusdt/app/model"
)

type barkCapture struct {
	path string
	body map[string]string
}

func newBarkServer(t *testing.T, status int, resp string) (*httptest.Server, chan barkCapture) {
	t.Helper()
	ch := make(chan barkCapture, 4)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		m := map[string]string{}
		_ = json.Unmarshal(raw, &m)
		if r.Method != http.MethodPost {
			t.Errorf("method = %s", r.Method)
		}
		ch <- barkCapture{path: r.URL.Path, body: m}
		w.WriteHeader(status)
		_, _ = w.Write([]byte(resp))
	}))
	t.Cleanup(srv.Close)

	return srv, ch
}

func TestBarkInitializeRequiresDeviceKey(t *testing.T) {
	for _, p := range []string{``, `{}`, `{"device_key":"  "}`} {
		if err := (&Bark{}).Initialize(p); err == nil {
			t.Fatalf("params %q: want error", p)
		}
	}
}

func TestBarkServerDefaultsAndTrailingSlash(t *testing.T) {
	b := &Bark{}
	if err := b.Initialize(`{"device_key":"k"}`); err != nil {
		t.Fatal(err)
	}
	if b.server != "https://api.day.app" {
		t.Fatalf("server = %q", b.server)
	}

	b = &Bark{}
	if err := b.Initialize(`{"device_key":"k","server":"https://bark.example.com//"}`); err != nil {
		t.Fatal(err)
	}
	if b.server != "https://bark.example.com" {
		t.Fatalf("server = %q", b.server)
	}
}

func TestBarkTestPostsToCustomServer(t *testing.T) {
	srv, ch := newBarkServer(t, 200, `{"code":200,"message":"success"}`)
	b := &Bark{}
	if err := b.Initialize(`{"device_key":"test-key","server":"` + srv.URL + `/"}`); err != nil {
		t.Fatal(err)
	}
	if err := b.Test(); err != nil {
		t.Fatal(err)
	}

	c := <-ch
	if c.path != "/push" || c.body["device_key"] != "test-key" || c.body["group"] != "BEpusdt" {
		t.Fatalf("unexpected request: %+v", c)
	}
	if c.body["title"] == "" || !strings.Contains(c.body["body"], "Bark") {
		t.Fatalf("unexpected title/body: %+v", c.body)
	}
}

func TestBarkSuccessTitleBodyAndURL(t *testing.T) {
	srv, ch := newBarkServer(t, 200, `{"code":200,"message":"success"}`)
	b := &Bark{}
	if err := b.Initialize(`{"device_key":"test-key","server":"` + srv.URL + `"}`); err != nil {
		t.Fatal(err)
	}

	now := model.Datetime(time.Now())
	o := model.Order{
		OrderId:   "ORDER-1",
		Status:    model.OrderStatusSuccess,
		TradeType: model.UsdtTrc20,
		RefHash:   "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		Address:   "TXyz1234567890abcdefghijklmnopqrstu",
	}
	o.CreatedAt = &now
	o.UpdatedAt = &now
	b.Success(o)

	c := <-ch
	if c.body["title"] != "收款成功" {
		t.Fatalf("title = %q", c.body["title"])
	}
	if !strings.Contains(c.body["body"], "ORDER-1") || strings.Contains(c.body["body"], o.RefHash) || strings.Contains(c.body["body"], o.Address) {
		t.Fatalf("body not masked or missing order: %q", c.body["body"])
	}
	if c.body["url"] != o.GetTxUrl() || c.body["url"] == "" {
		t.Fatalf("url = %q, want %q", c.body["url"], o.GetTxUrl())
	}
}

func TestBarkTestReturnsErrorOnServerFailure(t *testing.T) {
	for name, tc := range map[string]struct {
		status int
		resp   string
	}{
		"http 500":      {500, `{"message":"boom"}`},
		"body code 400": {200, `{"code":400,"message":"bad device key"}`},
	} {
		t.Run(name, func(t *testing.T) {
			srv, _ := newBarkServer(t, tc.status, tc.resp)
			b := &Bark{}
			if err := b.Initialize(`{"device_key":"secret-key","server":"` + srv.URL + `"}`); err != nil {
				t.Fatal(err)
			}
			err := b.Test()
			if err == nil {
				t.Fatal("want error")
			}
			if strings.Contains(err.Error(), "secret-key") {
				t.Fatalf("error leaks device key: %v", err)
			}
		})
	}
}

func TestBarkSoundDefaultsAndCustom(t *testing.T) {
	for name, tc := range map[string]struct{ params, want string }{
		"missing": {`"device_key":"k"`, "chime"},
		"blank":   {`"device_key":"k","sound":"   "`, "chime"},
		"custom":  {`"device_key":"k","sound":"  bell "`, "bell"},
	} {
		t.Run(name, func(t *testing.T) {
			srv, ch := newBarkServer(t, 200, `{"code":200,"message":"success"}`)
			b := &Bark{}
			if err := b.Initialize(`{` + tc.params + `,"server":"` + srv.URL + `"}`); err != nil {
				t.Fatal(err)
			}
			if b.sound != tc.want {
				t.Fatalf("sound = %q, want %q", b.sound, tc.want)
			}
			if err := b.Test(); err != nil {
				t.Fatal(err)
			}
			if got := (<-ch).body["sound"]; got != tc.want {
				t.Fatalf("request sound = %q, want %q", got, tc.want)
			}
		})
	}
}
