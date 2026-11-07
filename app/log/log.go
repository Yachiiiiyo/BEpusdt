package log

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/natefinch/lumberjack"
	"github.com/sirupsen/logrus"
)

// DefaultDir 是日志默认目录,与数据库同在挂载目录 /var/lib/bepusdt 下
const DefaultDir = "/var/lib/bepusdt/log/"

var (
	Task    *logrus.Logger
	be      *logrus.Logger
	loggers []*lumberjack.Logger
	logPath string
)

func newLogger(file string) (*logrus.Logger, error) {
	logger := logrus.New()
	logger.SetFormatter(&logrus.TextFormatter{
		ForceColors:     true,
		ForceQuote:      true,
		TimestampFormat: "2006-01-02 15:04:05",
		FullTimestamp:   true,
	})

	logger.SetLevel(logrus.InfoLevel)
	output := &lumberjack.Logger{
		Filename:   file,
		MaxSize:    300,
		MaxBackups: 5,
		MaxAge:     7,
		Compress:   true,
	}

	logger.SetOutput(output)
	loggers = append(loggers, output)

	return logger, nil
}

func Init(dir string) error {
	if dir = strings.TrimSpace(dir); dir == "" {
		dir = DefaultDir
	}
	if abs, err := filepath.Abs(dir); err == nil {
		dir = abs
	}

	if err := os.MkdirAll(dir, os.ModePerm); err != nil {
		return fmt.Errorf("创建日志目录失败：%w", err)
	}

	var err error

	be, err = newLogger(filepath.Join(dir, "bepusdt.log"))
	if err != nil {
		return err
	}

	Task, err = newLogger(filepath.Join(dir, "task.log"))
	if err != nil {
		return err
	}

	logPath = dir
	fmt.Printf("日志目录：%s\n", dir)

	return nil
}

func Debug(args ...interface{}) {
	be.Debugln(args...)
}

func Info(args ...interface{}) {
	be.Infoln(args...)
}

func Error(args ...interface{}) {
	be.Errorln(args...)
}

func Warn(args ...interface{}) {
	be.Warnln(args...)
}

func GetWriter() *io.PipeWriter {

	return be.Writer()
}

func GetPath() string {
	return logPath
}

func Close() {
	for _, f := range loggers {
		if f != nil {
			if err := f.Close(); err != nil {
				_, _ = fmt.Fprintln(os.Stderr, fmt.Sprintf("日志句柄资源关闭错误：%s", err.Error()))
			}
		}
	}

	loggers = nil
}
