var fs = require('fs');
var HashMap = require('../../utils/hashmap');
var m_cssz = require("../../models/m_cssz");
var m_tpsy = require("../../models/m_tpsy");
var c_page = require("../../controllers/c_page");
var webService = require("../../controllers/tpsy/webservice");
var getValue_plc = require("../../controllers/tpsy/getValue_plc");
var property = JSON.parse(fs.readFileSync('app/config/config_webservice.json', 'utf8'));
var url = property.URL;
//var url = "http://172.22.33.6:8088/Service1.asmx?wsdl";
$(document).ready(function () {
    fillCombobox();
    updataCountShow();
    sycsInit();
    $('#zc').hide();
    $('#yc').hide();
    $("#btn_cssz").click(CreatWindows_cssz);
    $("#btn_ngsjcx").click(CreatWindows_ngsjcx);
    $("#btn_zcsjcx").click(CreatWindows_zcsjcx);
    $("#btn_cxdy").click(print);
    add_NG_DB();
    sealing_dispose();
    filltable();
    judgeNormal();
});

function fillCombobox (){
    c_page.regFillCombobox(function (json_xh) {
        $('#combobox_xh').combobox("loadData",json_xh);
    })
}
function print() {
    var json_xh_value = $('#combobox_xh').combobox('getValue');
    c_page.doPrint(json_xh_value);
}
function CreatWindows_cssz() {
    var csszMap = require('electron').remote.getGlobal('sharedObject').csszMap;
    $('#win_cssz').window({
        title:'参数设置',
        left:500,
        top:80,
        collapsible:false,
        minimizable:false,
        maximizable:false,
        closable:true,
        width:440,
        height:150 + csszMap.size()*40,
        modal:false,
        draggable:true
    });
    $('#win_cssz').window('refresh', './tpsy_cssz.html');
}
function CreatWindows_ngsjcx() {
    $('#win_ngsjcx').window({
        title: 'NG数据查询',
        left:200,
        top:80,
        collapsible:false,
        minimizable:false,
        maximizable:false,
        closable:true,
        width:1040,
        height:680,
        modal:false,
        draggable:true
    });
    $('#win_ngsjcx').window('refresh', './tpsy_sjcx.html');
}
function CreatWindows_zcsjcx() {
    $('#win_normalsjcx').window({
        title: '正常数据查询',
        left:200,
        top:80,
        collapsible:false,
        minimizable:false,
        maximizable:false,
        closable:true,
        width:1040,
        height:680,
        modal:false,
        draggable:true
    });
    $('#win_normalsjcx').window('refresh', './tpsy_sjcx_normal.html');
}
function sycsInit() {
    m_cssz.query_csszInit(function (err,result) {
        if(err){
            console.log(err);
            return;
        }
        var key = "";
        var value = "";
        var hashMap = new HashMap.Map();
        for(var i = 0; i < result.recordset.length; i++){
            var record = result.recordset[i];
            key =  record.name ;
            value =  record.value ;
            hashMap.put(key,value);
        }
        $('#sy_sbh').text(hashMap.get("sbh"));
        $('#sy_czrygh').text(hashMap.get("czrygh"));
        $('#sy_scgd').text(hashMap.get("scgd"));
        $('#sy_pc').text(hashMap.get("pc"));
        $('#sy_rlfw').text(hashMap.get("rlfw").replace(";","-"));
        $('#sy_zxs').text(hashMap.get("zxs"));
        $('#sy_sjsx').text(hashMap.get("sjsx")==1 ? " 是" : "否");
        $('#ng_table_sy').datagrid({
            columns: [[
                {field:'dx',title:'电芯条码'},
                {field:'dy',title:'电压'+"("+hashMap.get('dyfw').replace(";","-")+")"},
                {field:'nz',title:'内阻'+"("+hashMap.get('nzfw').replace(";","-")+")"},
                {field:'rl',title:'容量'+"("+hashMap.get('rlfw').replace(";","-")+")"},
                {field:'dyc',title:'电压差'+"("+hashMap.get('dycfw').replace(";","-")+")"},
                {field:'ocv4',title:'ocv4'},
                {field:'result',title:'结果'}
            ]]
        });
        m_tpsy.query_ngLength(function (err,result) {
            if(err){
                console.log(err);
                return;
            }
            for(var i = 0;i < result.recordset.length; i++){
                $('#sy_ngdxsl').text(result.recordset[i].length);
            }
        });
        m_tpsy.query_normalLength(function (err,result) {
            if(err){
                console.log(err);
                return;
            }
            for(var i = 0;i < result.recordset.length; i++){
                $('#sy_dxsl').text(result.recordset[i].length);
            }
        });
    });
}

function judgeNormal() {
    c_page.regScanBarCode(function (arg) {
        var csszMap = require('electron').remote.getGlobal('sharedObject').csszMap;
        var Json_Check = {
            Key : "",
            Role : "",
            TransactionType: 0,
            StarData : "",
            EndData : "",
            InDataSet :[{
                RltBillNo :csszMap.get("scgd"),   //"SCTZD104579",               //数据库查询 生产工单
                CaseNo : arg,   //"01491377",                             //扫码得到 箱号
                CapSubGrade : csszMap.get("rld"), //"9",                   //数据库查询 容量档
                PdtGrade : "",  //"A5X",                  //数据库查询 档位，暂时制空
                MachineNo :csszMap.get("sbh"),   //"4#",            //数据库查询 设备号
                WorkerNo : csszMap.get("czrygh")    //"8888"                //数据库查询 操作人员工号
            }]
        };
        var json = JSON.stringify(Json_Check);
        webService.check(url,json,function (result) {
            if(result.ret == 0){
                $('#zc').show();
                $('#yc').hide();
            }
            else{
                $('#yc_text').text(result.Msg);
                $('#yc').show();
                $('#zc').hide();
                c_page.boxError();
            }
        });
    });
}

function add_NG_DB() {
    c_page.regValue_ng(function (dataArr_addNG) {
        getValue_plc.add_NG(dataArr_addNG);
    });
}

function updataCountShow() {
    setInterval(function() {
        m_tpsy.query_normalLength(function (err,result) {
            if(err){
                console.log(err);
                return;
            }
            var normalBarArr = require('electron').remote.getGlobal('sharedObject').normalBarArr;
            var count = parseInt(result.recordset[0].normalcount) + normalBarArr.length;
            if($('#sy_dxsl').text() == "" || count > parseInt($('#sy_dxsl').text())){
                $('#sy_dxsl').text(count);
            }
        });
        m_tpsy.query_ngLength(function (err,result) {
            if(err){
                console.log(err);
                return;
            }
            for(var i = 0;i < result.recordset.length; i++){
                $('#sy_ngdxsl').text(result.recordset[i].ngcount);
            }
        });
    }, 1000);
}
function sealing_dispose() {
    c_page.regValue_casenum(function (dataArr_addNoraml) {
        getValue_plc.add_normal(dataArr_addNoraml);
        getValue_plc.select_normal(function (dataArr) {
            var dataArr_upload = dataArr;
            for(var i = 0; i < dataArr_upload.length; i++){
                var upload = dataArr_upload[i];
                var Json_Upload = {
                    Key: "",      //未使用，为空字符串
                    Role: "",      //未使用，为空字符串
                    TransactionType: 1,     //校验check:0   数据上传：1
                    StartDate: "",//未使用，空字符串
                    EndDate: "", //未使用，空字符串
                    InDataSet :[{
                        LotNo: upload.batch,     // 批号
                        RltBillNo: upload.productionorder,   //筛选单号
                        MachineNo: upload.equiptmentnum,  //机台号
                        WorkerNo: upload.workernum,  // 工号
                        Qty: upload.binningnum,          //数量
                        LevelGrade: "",        //档位 对应等级
                        CapSubGrade: upload.volume_min+"-"+upload.volume_max,      //容量档 对应容量范围
                        Voltage: upload.voltage_min+"-"+upload.voltage_max,  //电压
                        InterResist: upload.resistance_min+"-"+upload.resistance_max,       //内阻
                        RecordTime: upload.creattime,      //时间
                        ReTest: upload.checknum,      // 二次筛选 筛选次数
                        Remark: ""           //    备注
                    }]
                };
                var json = JSON.stringify(Json_Upload);
                webService.upload(url,json,function (result) {
                    if(result.ret == 0){
                        console.log("case update : sccu")
                    }
                    else { console.log("case update errot:"+result.Msg) }
                });
            }
        });
    });
}

/* datagrid 初始化  */
function dataGrid_Init(dataArr) {
    $('#ng_table_sy').datagrid("loadData",dataArr);
}

function filltable(){
    /* dataArr格式 ： [{},{},...] 对象数组  */
    c_page.regFilltable(function (dataArr) {
        $('#ng_table_sy').datagrid("loadData",dataArr);
    });
}

function closeCsszWin(){
    $('#win_cssz').window('close');
}




