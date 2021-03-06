var fs = require('fs');
var HashMap = require('../../utils/hashmap');
var m_cssz = require("../../models/m_cssz");
var m_tpsy = require("../../models/m_tpsy");
var c_page = require("../../controllers/c_page");
var webService = require("../../controllers/tpsy/webservice");
var getValue_plc = require("../../controllers/tpsy/getValue_plc");
var choose_dx = require("../../controllers/tpsy/choose_dx");
var property = JSON.parse(fs.readFileSync('app/config/config_webservice.json', 'utf8'));
var electron = require('electron');
//var dataformat = require('../../utils/dataformat');
var url = property.URL;
var checkResultArr = [];
//var url = "http://221.178.135.214:8099/Service1.asmx?wsdl";
//var count = 0;
$(document).ready(function () {
    fillCombobox();
    updataCountShow();
    sycsInit();
    $('#zc').hide();
    $('#yc').hide();
    $("#btn_cssz").click(creatWindows_cssz);
    $("#btn_dxth").click(creatWindows_dxth);
    $("#btn_ngsjcx").click(creatWindows_ngsjcx);
    $("#btn_zcsjcx").click(creatWindows_zcsjcx);
    $("#btn_cxdy").click(print);
    $("#btn_qlfx").click(qlfx);
    addNg();
    sealingDispose();
    fillTable();
    judgeNormal();
});

//显示扫码结果信息
function updataCheckResult() {
    //遍历checkResultArr
    for(var i = 0; i < checkResultArr.length; i++){
        var arg = checkResultArr[i].arg;
        var ret = checkResultArr[i].ret;
        var Msg = '正常';
        var checkFlag = 'zc';
        var nowCheck ='';
        if(ret == 1){
            checkFlag = 'yc';
            Msg = checkResultArr[i].Msg;//异常则有异常信息,需要显示出来
        }
        var historyCheck = 'normal';
        if(i == 0){
            historyCheck = 'now';
            nowCheck = 'now-';
        }
        console.log(arg);
        var htmlStr = '<img class="'+historyCheck+'-picture" src="../../../public/img/icon_tp/icon-big-'+checkFlag+'.png"/>'+
            '<div class="history_list">'+
            '<span class="'+checkFlag+''+nowCheck+'content">'+Msg+'</span>'+
            '<span class="'+checkFlag+''+nowCheck+'content-code">'+arg+'</span>'+
            '</div>';
        $("#check_0"+(i+1)).html(htmlStr);
    }
}

//发送尾料封箱消息
function qlfx() {
    if(window.confirm('确定要进行尾料清算吗？')) {
        c_page.doQlfx();
    }
}

//填充箱号下拉框值
function fillCombobox (){
    c_page.regFillCombobox(function (json_xh) {
        $('#combobox_xh').combobox('loadData',json_xh);
    })
}

//重新打印箱号
function print() {
    var json_xh_value = $('#combobox_xh').combobox('getValue');
    c_page.doPrint(json_xh_value);
}

//打开参数设置界面
function creatWindows_cssz() {
    var csszMap = electron.remote.getGlobal('sharedObject').csszMap;
    $('#win_cssz').window({
        title:'参数设置',
        left:500,
        top:30,
        collapsible:false,
        minimizable:false,
        maximizable:false,
        closable:true,
        width:440,
        height:150 + csszMap.size()*39,
        modal:true,
        draggable:true
    });
    $('#win_cssz').window('refresh', './tpsy_cssz.html');
}

//打开电芯替换界面
function creatWindows_dxth() {
    $('#win_dxth').window({
        title: '电芯替换',
        left:230,
        top:90,
        collapsible:false,
        minimizable:false,
        maximizable:false,
        closable:true,
        width:1040,
        height:580,
        modal:true,
        draggable:true
    });
    $('#win_dxth').window('refresh', './tpsy_dxth.html');
}


//打开NG电芯查询界面
function creatWindows_ngsjcx() {
    $('#win_ngsjcx').window({
        title: 'NG数据查询',
        left:230,
        top:50,
        collapsible:false,
        minimizable:false,
        maximizable:false,
        closable:true,
        width:1040,
        height:710,
        modal:true,
        draggable:true
    });
    $('#win_ngsjcx').window('refresh', './tpsy_sjcx.html');
}

//打开正常电芯查询界面
function creatWindows_zcsjcx() {
    $('#win_normalsjcx').window({
        title: '正常数据查询',
        left:230,
        top:50,
        collapsible:false,
        minimizable:false,
        maximizable:false,
        closable:true,
        width:1040,
        height:710,
        modal:true,
        draggable:true
    });
    $('#win_normalsjcx').window('refresh', './tpsy_sjcx_normal.html');
}

//左边参数设置初始化
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
        $('#sy_sbh').text(hashMap.get('sbh'));
        $('#sy_czrygh').text(hashMap.get('czrygh'));
        $('#sy_scgd').text(hashMap.get('scgd'));
        $('#sy_pc').text(hashMap.get('pc'));
        $('#sy_rlfw').text(hashMap.get('rlfw').replace(';','-'));
        $('#sy_zxs').text(hashMap.get('zxs'));
        $('#sy_sjsx').text(hashMap.get('sjsx')==1 ? '是' : '否');
        $('#ng_table_sy').datagrid({
            columns: [[
                {field:'dx',title:'电芯条码',width : 180},
                {field:'dy',title:'电压'+"("+hashMap.get('dyfw').replace(';','-')+")",width : 130},
                {field:'nz',title:'内阻'+"("+hashMap.get('nzfw').replace(';','-')+")",width : 120},
                {field:'rl',title:'容量'+"("+hashMap.get('rlfw').replace(';','-')+")",width : 120},
                {field:'dyc',title:'电压差'+"("+hashMap.get('dycfw').replace(';','-')+")",width : 130},
                {field:'ocv4',title:'ocv4',width : 100},
                {field:'result',title:'结果',width : 120}
            ]]
        });
        $('#sy_ngdxsl').text(0);
        $('#sy_dxsl').text(0);
    });
}

//判断箱号是否异常
function judgeNormal() {
    //接受扫码传来的箱号信息
    c_page.regScanCasenum(function (arg) {
        /*count++;
        var arg=dataformat.fillZero(count,8);*/
        var csszMap = electron.remote.getGlobal('sharedObject').csszMap;
        var Json_Check = {
            Key : "",
            Role : "",
            TransactionType: 0,
            StarData : "",
            EndData : "",
            InDataSet :[{
                RltBillNo :csszMap.get("scgd"),     //"SCTZD104579",//数据库查询 生产工单
                CaseNo : arg,                       //"01491377",//扫码得到 箱号
                CapSubGrade : csszMap.get("rld"),   //"9",//数据库查询 容量档
                PdtGrade : "",                      //"A5X",//数据库查询 档位，暂时制空
                MachineNo :csszMap.get("sbh"),      //"4#",//数据库查询 设备号
                WorkerNo : csszMap.get("czrygh")    //"8888",//数据库查询 操作人员工号
            }]
        };
        var json = JSON.stringify(Json_Check);
        //上传天鹏MES返回对应箱号信息
        webService.check(url,json,function (result) {
            //将历史检测结果记录下来
            if(checkResultArr == "" || arg!="undefined" && arg !=checkResultArr[0].arg){
                checkResultArr.unshift({arg:arg,ret :result.ret,Msg :result.Msg});
                while(checkResultArr.length >5){
                    checkResultArr.pop();
                }
                updataCheckResult();
            }
        });
    });
}

//NG数据入库
function addNg() {
    c_page.regValue_ng(function (dataArr_addNG) {
        getValue_plc.add_ng(dataArr_addNG);
    });
}

//更新实时电芯数量
function updataCountShow() {
    setInterval(function() {
        m_tpsy.query_normalLength(function (err,result) {
            if(err){
                console.log(err);
                return;
            }
            var normalBarArr = electron.remote.getGlobal('sharedObject').normalBarArr;
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
        var normalCount = electron.remote.getGlobal('sharedObject').normalCount;
        var ngCount = electron.remote.getGlobal('sharedObject').ngCount;
        $('#sy_yxdxsl').text(normalCount);
        $('#sy_yxngdxsl').text(ngCount);
    }, 1000);
}

//封箱处理
function sealingDispose() {
    c_page.regValue_casenum(function (dataArr_addNoraml) {
        getValue_plc.add_normal(dataArr_addNoraml);
        var csszMap = electron.remote.getGlobal('sharedObject').csszMap;
        //上传天鹏MES装箱的信息
        var Json_Upload = {
            Key: "",      //未使用，为空字符串
            Role: "",      //未使用，为空字符串
            TransactionType: 1,     //校验check:0   数据上传：1
            StartDate: "",//未使用，空字符串
            EndDate: "", //未使用，空字符串
            InDataSet :[{
                LotNo: csszMap.get("pc"),                                   //批号
                RltBillNo: csszMap.get("scgd"),                             //筛选单号
                MachineNo: csszMap.get("sbh"),                              //机台号
                WorkerNo: csszMap.get("czrygh"),                            //工号
                Qty: dataArr_addNoraml.length,                              //数量
                LevelGrade: "",                                             //档位 对应等级
                CapSubGrade: (csszMap.get("rlfw")).replace(";","-"),        //容量档 对应容量范围
                Voltage: (csszMap.get("dyfw")).replace(";","-"),            //电压
                InterResist: (csszMap.get("nzfw")).replace(";","-"),        //内阻
                RecordTime: "",                                             //时间
                ReTest: "",                                                 //二次筛选,筛选次数
                Remark: ""                                                  //备注
            }]
        };
        var json = JSON.stringify(Json_Upload);
        webService.upload(url,json,function (result) {
            if(result.ret == 0){
                console.log('case update : sccu')
            }
            else { console.log('case update errot:'+result.Msg) }
        });
    });
}

/* datagrid 初始化  */
function dataGrid_Init(dataArr) {
    $('#ng_table_sy').datagrid('loadData',dataArr);
}

//填充实时数据表格
function fillTable(){
    /* dataArr格式 ： [{},{},...] 对象数组  */
    c_page.regFilltable(function (dataArr) {
        $('#ng_table_sy').datagrid('loadData',dataArr);
    });
}

//关闭参数设置界面
function closeCsszWin(){
    $('#win_cssz').window('close');
}