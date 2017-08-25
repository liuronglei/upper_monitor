const {app, globalShortcut, BrowserWindow} = require('electron')
const path = require('path')
const url = require('url')
const fs = require('fs')
const ipcMain = require('electron').ipcMain;
const m_cssz = require(path.join(__dirname, 'app/models/m_cssz'))
const fileread = require(path.join(__dirname, 'app/utils/fileread'))
const dataformat = require(path.join(__dirname,'app/utils/dataformat'));
var property_ocv = JSON.parse(fs.readFileSync(path.join(__dirname, 'app/config/config_ocv.json'), 'utf8'));
var property_plc = JSON.parse(fs.readFileSync(path.join(__dirname, 'app/config/config_plc.json'), 'utf8'));
var isWinOpening = false;

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win

function createWindow () {
    // Create the browser window.
    win = new BrowserWindow({width: 1600, height:  900,autoHideMenuBar :true})
    //win.maximize();
    //win.setFullScreen(true);
    win.setMenu(null);
    // globalShortcut.register('ESC', function() {
    //     win.setFullScreen(!win.isFullScreen());
    // });

    // and load the index.html of the app.
    win.loadURL(url.format({
        pathname: path.join(__dirname, 'app/views/tpsy/tpsy_sy.html'),
        protocol: 'file:',
        slashes: true
    }))

    // Open the DevTools.
    //win.webContents.openDevTools()

    // Emitted when the window is closed.
    win.on('closed', () => {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        win = null
})
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
//app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
    app.quit()
}
})

app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (win === null) {
    createWindow()
}
})

//保存全局变量
global.sharedObject = {
    rootdir: __dirname,
    normalBarArr: new Array(),
    checkBarCodeArr: new Array(),
    printDataArr: new Array(2),
    checkIndex: 0,
    barCodeNum: 0,
};

//接收界面参数设置消息，更新参数设置
ipcMain.on('updateCssz-ping-event',(event) => {
    updateCssz();
})

//接收界面箱号扫描错误消息，进行报警
ipcMain.on('boxError-ping-event',(event) => {
    doErrorVoice();
})

//接收界面打印请求，进行打印
ipcMain.on('casenumPrint-ping-event',(event, arg) => {
    console.log(arg);
    var printDataArr = global.sharedObject.printDataArr;
    var printData = null;
    for(var i=0; i<printDataArr.length; i++) {
        if(typeof printDataArr[i] != "undefined" && printDataArr[i] != null && arg == printDataArr[i].tm) {
            printData = printDataArr[i];
        }
    }
    console.log(printData);
    if(printData != null) casenumPrint(printData);
})

//串口发送箱号给渲染进程
function scan_barcode(arg) {
    win.webContents.send('scanBarCode-pong-event', arg)
}

//NG数据入库
function send_ng(dataArr) {
    win.webContents.send('add_ng-pong-event',dataArr);
}

//填充首页表格数据
function send_filltable(dataArr) {
    win.webContents.send('filltable-pong-event',dataArr);
}

//装箱消息发送
function send_sealing(dataArr) {
    win.webContents.send('sealing_dispose-pong-event',dataArr);
}

//打印箱号列表信息发送
function send_casenum(dataArr) {
    win.webContents.send('casenum_refresh-pong-event',dataArr);
}

//参数设置全局变量保存
function updateCssz() {
    m_cssz.fillCsszMap(function (hashmap) {
        global.sharedObject.csszMap = hashmap;
        //同时设置PLC参数
        plc.setCssz(hashmap);
        //如果勾选了ocv数据筛选，则读取对应ocv文件数据
        if(hashmap.get("sjsx") == "1" && (typeof global.sharedObject.excelMap == "undefined" || global.sharedObject.excelMap == null)) {
            saveOcvData();
        }
        //参数设置完成后，启动PLC标记位监听，并打开窗口
        schedulePLC(200);
        if(!isWinOpening) {
            isWinOpening = true;
            createWindow();
        }
    });
}

//ocv勾选后，保存ocv数据
function saveOcvData() {
    global.sharedObject.excelMap = fileread.readData(property_ocv.FILE_PATH);
}

//启动后，进行参数初始化
updateCssz();

//开始扫码枪监听
const scanner = require(path.join(__dirname, 'app/communication/comm_scanner'));
scanner.receive(function(barCode) {
    scan_barcode(barCode);
});

//开始plc数据监听
var plc = require(path.join(__dirname, 'app/communication/comm_plc'));
plc.start();

//启动后，要清空扫码数据表
const m_barcode = require(path.join(__dirname, 'app/models/m_barcode'))
m_barcode.clearData(function(){});

//定义错误声音输出
var errorTimeoutObj;
function errorVoice(count) {
    if(typeof count == "undefined") count = 0;
    if(count >= 30) return;
    process.stdout.write('\x07');
    errorTimeoutObj = setTimeout(function(){errorVoice(++count)},500);
}
function doErrorVoice() {
    clearTimeout(errorTimeoutObj);
    errorVoice();
}

//外观检测结束处理
function barCodeProcess() {
    m_barcode.queryBarCode(property_plc.CHECK_NUM_SINGLE,function (error, results, fields) {
        if (error) throw error;
        var csszMap = global.sharedObject.csszMap;
        //保存电芯条码列表
        var checkBarCodeArr = global.sharedObject.checkBarCodeArr;
        var currentBarCodeArr = new Array();
        for(var i=0; i<results.length; i++) {
            //barCodeArr[barCodeArr.length] = results[i].barcode;
            //checkBarCodeArr[checkBarCodeArr.length] = 'KA2GA18 ' + (i + 101004);
            //currentBarCodeArr[currentBarCodeArr.length] = 'KA2GA18 ' + (i + 101004);
            //console.log('barCode:' + results[i].barcode);
            var barCode = csszMap.get("sfsm") == "1" ? results[i].barcode : dataformat.fillZero(++global.sharedObject.barCodeNum, 8);
            checkBarCodeArr[checkBarCodeArr.length] = barCode;
            currentBarCodeArr[currentBarCodeArr.length] = barCode;
        }
        //如果参数设置勾选了OCV筛选，则需要传递OCV数据给PLC
        if(csszMap.get("sjsx") == "1" && csszMap.get("sfsm") == "1") {
            var excelMap = global.sharedObject.excelMap;
            var rlArr = new Array();
            var ocv4Arr = new Array();
            for(var i=0; i<currentBarCodeArr.length; i++) {
                var barObj = excelMap.get(currentBarCodeArr[i]);
                if(barObj != null) {
                    rlArr[rlArr.length] = parseFloat(barObj[1]);
                    ocv4Arr[ocv4Arr.length] = parseFloat(barObj[2])/1000;
                    //console.log("---inserBarCode---:" + currentBarCodeArr[i] + "---" + parseFloat(barObj[1]) + "---");
                } else {
                    /*
                    if(currentBarCodeArr[i] != "Fail" && currentBarCodeArr[i] != "Miss") {
                        console.log(currentBarCodeArr[i]);
                    }
                    */
                    rlArr[rlArr.length] = 0;
                    ocv4Arr[ocv4Arr.length] = 0;
                }
            }
            plc.writeBarInfo(rlArr,ocv4Arr);
        }
        //将标记位置为02，用于通知PLC已经存放数据
        plc.finishBarCodeFlag();
    });
}

//电性能检测结束处理
function checkProcess() {
    plc.readCheckInfo(function(nzArr,dyArr,zztArr,dyztArr,nzztArr,rlztArr,dycztArr) {
        //保存电性能能检测结果列表
        var csszMap = global.sharedObject.csszMap;
        var excelMap = global.sharedObject.excelMap;
        var normalBarArr = global.sharedObject.normalBarArr;
        var checkBarCodeArr = global.sharedObject.checkBarCodeArr;
        var rlfw = csszMap.get('rlfw');
        var rlfwArr = rlfw.split(";");
        var dycfw = csszMap.get('dycfw');
        var dycfwArr = dycfw.split(";");
        var dyfw = csszMap.get('dyfw');
        var dyfwArr = dyfw.split(";");
        var nzfw = csszMap.get('nzfw');
        var nzfwArr = nzfw.split(";");
        var dataArr_ng = new Array();
        var dataArr_filltable = new Array();
        for(var i=0; i<property_plc.CHECK_NUM_SINGLE; i++) {
            //取之前保存的电芯条码，取出后，置空
            var checkBarCode = checkBarCodeArr[global.sharedObject.checkIndex];
            checkBarCodeArr[global.sharedObject.checkIndex] == null;
            global.sharedObject.checkIndex++;
            if(checkBarCode == property_plc.BARCODE_MISS) {
                var fillObj = {
                    dx: checkBarCode,
                    rl: "----",
                    nz: "----",
                    dy: "----",
                    ocv4: "----",
                    dyc: "----",
                    result : property_plc.BARCODE_MISS
                };
                dataArr_filltable[dataArr_filltable.length] = fillObj;
            } else {
                var ng_reason = "";
                if(checkBarCode == property_plc.BARCODE_FAIL) {
                    ng_reason += ";NG1";
                }
                if(!zztArr[i]) {
                    if (!dyztArr[i]) ng_reason += ";NG2";
                    if (!nzztArr[i]) ng_reason += ";NG3";
                    if (!rlztArr[i]) ng_reason += ";NG4";
                    if (!dycztArr[i]) ng_reason += ";NG5";
                }
                //如果扫码不良，肯定拿不到容量和OCV4数据，所以去掉NG4和NG5
                if(ng_reason.indexOf(";NG1") != -1) {
                    ng_reason = ng_reason.replace(";NG4", "");
                    ng_reason = ng_reason.replace(";NG5", "");
                }
                if (ng_reason != "") ng_reason = ng_reason.substring(1);
                var rl = "null";
                var ocv4 = "null";
                var dyc = "null";
                if(csszMap.get("sjsx") == "1") {
                    var barInfo = excelMap.get(checkBarCode);
                    if(barInfo != null) {
                        rl = barInfo[1];
                        ocv4 = (parseFloat(barInfo[2])/1000).toFixed(3);
                        dyc = (parseFloat(barInfo[2])/1000-dyArr[i]).toFixed(3);
                    }
                }
                //开始组建NG和正常列表
                var barObj = {
                    sbh: csszMap.get("sbh"),
                    czrygh: csszMap.get("czrygh"),
                    scgd: csszMap.get("scgd"),
                    pc: csszMap.get("pc"),
                    dx: checkBarCode,
                    dy: dyArr[i].toFixed(3),
                    dy_min: dyfwArr[0],
                    dy_max: dyfwArr[1],
                    nz: nzArr[i].toFixed(3),
                    nz_min: nzfwArr[0],
                    nz_max: nzfwArr[1],
                    rl : rl,
                    rl_min: csszMap.get("sjsx") != "1" ? "null" : rlfwArr[0],
                    rl_max: csszMap.get("sjsx") != "1" ? "null" : rlfwArr[1],
                    ocv4 : ocv4,
                    dyc: dyc,
                    dyc_min: dycfwArr[0],
                    dyc_max: dycfwArr[1],
                    dj: "null",
                    dj_min: "null",
                    dj_max: "null",
                    zxs: csszMap.get("zxs"),
                    ng_reason: ng_reason
                };
                if(ng_reason != "") {
                    dataArr_ng[dataArr_ng.length] = barObj;
                } else {
                    normalBarArr[normalBarArr.length] = barObj;
                }
                //开始组建filltable列表
                var fillObj = {
                    dx: checkBarCode,
                    rl: rl == "null" ? "----" : rl,
                    nz: nzArr[i].toFixed(3),
                    dy: dyArr[i].toFixed(3),
                    ocv4: ocv4 == "null" ? "----" : ocv4,
                    dyc: dyc == "null" ? "----" : dyc,
                    result : ng_reason == "" ? "√" : ng_reason,
                };
                dataArr_filltable[dataArr_filltable.length] = fillObj;
                //console.log("---checkBarCode---:" + checkBarCode + "---" + rl + "---");
            }
        }
        //发送填充数据消息
        //console.log("filltable------------:" + dataArr_filltable.length);
        send_filltable(dataArr_filltable);
        //发送NG数据入库消息
        //console.log("dataArr_ng-----------:" + dataArr_ng.length);
        if(dataArr_ng.length > 0) send_ng(dataArr_ng);
        //重置标记位
        plc.resetCheckFlag();
    });
}

//封箱结束处理
const print = require(path.join(__dirname, 'app/communication/comm_print'))
var getValue_plc = require(path.join(__dirname, 'app/controllers/tpsy/getValue_plc'));
function boxProcess() {
    getValue_plc.select_casenum(function(casenum) {
        var csszMap = global.sharedObject.csszMap;
        var scgd = csszMap.get("scgd");
        var rlfwStr = csszMap.get("rlfw");
        var dyfwStr = csszMap.get("dyfw");
        var nzfwStr = csszMap.get("nzfw");
        var zxs = csszMap.get("zxs");
        var rld = csszMap.get("rld");
        //获得箱号
        var xh_int = parseInt(casenum) + 1;
        var xh = dataformat.fillZero(xh_int, 8);
        //向界面发送消息，进行处理
        var normalBarArr = global.sharedObject.normalBarArr;
        var dataArr = new Array();
        var newBarArr = new Array();
        var zxsInt = parseInt(zxs);
        //console.log("start----xh-------:" + xh);
        //console.log("start----normal-------:" + normalBarArr.length);
        //console.log("start----normal-------:" + global.sharedObject.normalBarArr.length);
        for(var i=0; i<normalBarArr.length; i++) {
            if(i < zxsInt) {
                normalBarArr[i].xh = xh;
                dataArr[dataArr.length] = normalBarArr[i];
            } else {
                newBarArr[newBarArr.length] = normalBarArr[i];
            }
        }
        global.sharedObject.normalBarArr = newBarArr;
        console.log("end----normal-------:" + global.sharedObject.normalBarArr.length);
        //console.log("end----sendArr-------:" + dataArr.length);
        send_sealing(dataArr);
        //打印标签
        var printData = {
            sxdh:scgd,
            rlfw:csszMap.get("sfdyrlfw") == "1" ? rlfwStr.replace(";","-") : "",
            rld:rld,
            dyfw:dyfwStr.replace(";","-"),
            nzfw:nzfwStr.replace(";","-"),
            sl:zxs,
            tm:xh};
        casenumPrint(printData);
        //保存打印列表
        var printDataArr = global.sharedObject.printDataArr;
        printDataArr.splice(0, 0, printData);
        printDataArr.length = printDataArr.length - 1;
        var casenumArr = new Array();
        for(var i=0; i<printDataArr.length; i++) {
            if(typeof printDataArr[i] != "undefined" && printDataArr[i] != null) {
                casenumArr[casenumArr.length] = {value:printDataArr[i].tm,text:printDataArr[i].tm};
                casenumArr[0].selected = true;
            }
        }
        console.log(casenumArr);
        send_casenum(casenumArr);
        //重置标记位
        plc.resetBoxFlag();
    });
}

function casenumPrint(printData) {
    print.write(print.getData_TP(printData));
}

//定时取PLC数据（每200ms），如果发现标记你位被设置，则进行相应处理
function schedulePLC(runTime) {
    setInterval(function() {
        //获取3个标记位
        plc.readAllFlag(function(flagArr){
            //扫码结束标记位
            if(flagArr[0]) barCodeProcess();
            //电性能检测结束标记位
            if(flagArr[1]) checkProcess();
            //封箱标记位
            if(flagArr[2]) boxProcess();
        });
    }, runTime);
}

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

//箱号扫码
//天鹏MES
//显示到界面
//取到外观数据（条码）
//（获取PCI标记）根据条码获取到PLC检测数据
//NG数据入库
//（获取PCI标记）封箱
//生成箱号
//正常数据入库，天鹏MES