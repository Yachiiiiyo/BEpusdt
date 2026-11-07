package admin

import (
	"github.com/gin-gonic/gin"
	"github.com/v03413/bepusdt/app/handler/base"
	"github.com/v03413/bepusdt/app/model"
)

type Sweep struct {
}

type sListReq struct {
	base.ListRequest
	State   string `json:"state"`
	Address string `json:"address"`
	OrderId string `json:"order_id"`
}

type sRetryReq struct {
	ID int64 `json:"id" form:"id" binding:"required"`
}

type sCollectReq struct {
	DeriveId int64 `json:"derive_id" form:"derive_id" binding:"required"`
}

func (Sweep) List(ctx *gin.Context) {
	var req sListReq
	if err := ctx.ShouldBind(&req); err != nil {
		base.Response(ctx, 400, err.Error())

		return
	}

	var data []model.Sweep
	db := model.Db.Model(&model.Sweep{})
	if req.State != "" {
		db = db.Where("state = ?", req.State)
	}
	if req.Address != "" {
		db = db.Where("address LIKE ?", "%"+req.Address+"%")
	}
	if req.OrderId != "" {
		db = db.Where("order_id LIKE ?", "%"+req.OrderId+"%")
	}

	var total int64
	if err := db.Count(&total).Error; err != nil {
		base.Error(ctx, err)

		return
	}

	err := db.Limit(req.Size).Offset((req.Page - 1) * req.Size).Order("id " + req.Sort).Find(&data).Error
	if err != nil {
		base.Response(ctx, 400, err.Error())

		return
	}

	base.Response(ctx, 200, data, total)
}

func (Sweep) Retry(ctx *gin.Context) {
	var req sRetryReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		base.BadRequest(ctx, err.Error())

		return
	}

	if err := model.RetrySweep(req.ID); err != nil {
		base.BadRequest(ctx, err.Error())

		return
	}

	base.Response(ctx, 200, "重试成功")
}

func (Sweep) Collect(ctx *gin.Context) {
	var req sCollectReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		base.BadRequest(ctx, err.Error())

		return
	}

	if !model.IsSweepEnabled() {
		base.BadRequest(ctx, "HD 归集未启用")

		return
	}

	var record model.DerivedAddress
	res := model.Db.Where("id = ?", req.DeriveId).Limit(1).Find(&record)
	if res.Error != nil {
		base.Error(ctx, res.Error)

		return
	}
	if record.ID == 0 {
		base.BadRequest(ctx, "派生地址记录不存在")

		return
	}

	if err := model.EnqueueSweepByDerived(record, record.OrderId, ""); err != nil {
		base.BadRequest(ctx, err.Error())

		return
	}

	base.Response(ctx, 200, "已入队")
}

func (Sweep) Info(ctx *gin.Context) {
	var dest = model.SweepDestAddress()
	var gas = model.SweepGasAddress()
	if dest == "" {
		_, lower, err := model.HdAddressAt(0)
		if err == nil {
			dest = lower
			gas = lower
		}
	}

	base.Ok(ctx, gin.H{
		"enabled":      model.IsSweepEnabled(),
		"dest_address": dest,
		"gas_address":  gas,
		"trade_types":  model.GetHdTradeTypes(),
	})
}
