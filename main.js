const {app, globalShortcut, BrowserWindow} = require('electron');
const path = require('path');
const url = require('url');
const fs = require('fs');
const ipcMain = require('electron').ipcMain;
const m_cssz = require(path.join(__dirname, 'app/models/m_cssz'));
const fileread = require(path.join(__dirname, 'app/utils/fileread'));
const dataformat = require(path.join(__dirname,'app/utils/dataformat'));
const m_barcode = require(path.join(__dirname, 'app/models/m_barcode'));
var property_ocv = JSON.parse(fs.readFileSync(path.join(__dirname, 'app/config/config_ocv.json'), 'utf8'));
var property_plc = JSON.parse(fs.readFileSync(path.join(__dirname, 'app/config/config_plc.json'), 'utf8'));
var isWinOpening = false;
const timerRun = 200;
const timerInit = 500;
//const timeInterval = 2000;

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
        slashes: true,
    }));

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
    printDataArr: new Array(10),
    checkIndex: 0,
    barCodeNum: 0,
    isFillOcvData: false,
    //lastProcessDate: [null, null, null],
    barCodeIndex: 0,
    normalCount: 0,         //本次运行正常电芯数量
    ngCount: 0,             //本次运行NG电芯数量
    scheduleBarCode: false, //是否正在监听扫码
};

//条码前缀字符串
var preStr = dataformat.getNowFormatDate("", "");

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
    var printDataArr = global.sharedObject.printDataArr;
    var printData = null;
    for(var i=0; i<printDataArr.length; i++) {
        if(typeof printDataArr[i] != "undefined" && printDataArr[i] != null && arg == printDataArr[i].tm) {
            printData = printDataArr[i];
        }
    }
    if(printData != null) casenumPrint(printData);
})

//接收清料装箱消息，进行装箱
ipcMain.on('clearBox-ping-event',(event) => {
    doClearBox();
})

//串口发送箱号给渲染进程
function scan_barcode(arg) {
    win.webContents.send('scanBarCode-pong-event', arg);
}

//串口发送箱号给渲染进程
function scan_casenum(arg) {
    win.webContents.send('scanCasenum-pong-event', arg);
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

//开始扫码枪监听
const scanner = require(path.join(__dirname, 'app/communication/comm_scanner'));
scanner.receive(function(barCode) {
    var r = /^\+?[0-9][0-9]*$/;
    if(r.test(barCode)) {
        scan_casenum(barCode);
    } else {
        scan_barcode(barCode);
    }
});

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
        //如果窗口未打开
        if(!isWinOpening) {
            //打开窗口
            isWinOpening = true;
            createWindow();
            //启动PLC标记位监听
            schedulePLC_init();
            schedulePLC_check();
            schedulePLC_box();
        }
        //判断是否需要扫描箱号
        if(hashmap.get("sfsmxh") == "1") {
            scanner.start(function(){}); //如果已经启动，会报一个已经启动的错误，不影响
        } else {
            scanner.close(function(){});
        }
    });
}

//扫码和检测次数统计，用于后台输出，监控，程序稳定后可删除
var count_bar = 0;
var count_check = 0;

//ocv勾选后，保存ocv数据
function saveOcvData() {
    global.sharedObject.excelMap = fileread.readData(property_ocv.FILE_PATH);
}

//启动后，进行参数初始化
updateCssz();

//开始plc数据监听
var plc = require(path.join(__dirname, 'app/communication/comm_plc'));
plc.start();

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
function doClearBox() {
    clearInterval(boxTimer);
    boxProcess();
}

//初始化处理（PLC重启后，刚开机调用）
function initProcess() {
    //初始化读写标记
    //plc.initFlag();
    //初始化共享变量
    global.sharedObject.normalBarArr = new Array();
    global.sharedObject.checkBarCodeArr = new Array();
    global.sharedObject.checkIndex = 0;
    global.sharedObject.barCodeNum = 0;
    global.sharedObject.isFillOcvData = false;
    //如果正在监听扫码，则将标记置为false，让监听程序内部自动初始化，否则，启动监听
    if(global.sharedObject.scheduleBarCode) {
        global.sharedObject.scheduleBarCode = false;
    } else {
        startPLC_barCode();
    }
    //初始化条码前缀
    preStr = dataformat.getNowFormatDate("", "");
    //初始化扫码、检测计数
    count_bar = 0;
    count_check = 0;
}

//填充Ocv数据
function fillOcvData(currentBarCodeArr) {
    var csszMap = global.sharedObject.csszMap;
    if(csszMap.get("sjsx") == "1" && csszMap.get("sfsm") == "1") {
        if(global.sharedObject.isFillOcvData) {
            setTimeout(function() {
                fillOcvData(currentBarCodeArr);
            },50);
            return;
        }
        var excelMap = global.sharedObject.excelMap;
        var rlArr = new Array();
        var ocv4Arr = new Array();
        for(var i=0; i<currentBarCodeArr.length; i++) {
            var barObj = excelMap.get(currentBarCodeArr[i]);
            if(barObj != null) {
                rlArr[rlArr.length] = parseFloat(barObj[1]);
                ocv4Arr[ocv4Arr.length] = parseFloat(barObj[2])/1000;
            } else {
                rlArr[rlArr.length] = 0;
                ocv4Arr[ocv4Arr.length] = 0;
            }
        }
        plc.writeBarInfo(rlArr,ocv4Arr);
        //更改标记位值，用于通知PLC已经存放数据
        plc.finishOcvFlag();
        global.sharedObject.isFillOcvData = true;
    } else {
        //如果不需要OCV数据，则直接更改标记位值
        plc.finishOcvFlag();
    }
}

//外观检测结束处理
function barCodeProcess(callBack) {
    //plc.resetBarCodeFlag();
    //判断距离上一次处理的时间差
    /* （暂时不判断时间差）
    var newDate = new Date();
    var oldDate = global.sharedObject.lastProcessDate[0];
    if(oldDate != null && newDate-oldDate<timeInterval) {
        console.log('barCodeProcess:reset!!!!!!!!!!!');
        return;
    }
    global.sharedObject.lastProcessDate[0] = newDate;
     */
    console.log("barCodeCount:" + (++count_bar));
    var start = global.sharedObject.barCodeIndex-property_plc.CHECK_NUM_SINGLE+1;
    var end = global.sharedObject.barCodeIndex;
    m_barcode.queryBarCode(start,end,function (error, results, fields) {
        if (error) throw error;
        var csszMap = global.sharedObject.csszMap;
        //保存电芯条码列表
        var checkBarCodeArr = global.sharedObject.checkBarCodeArr;
        var currentBarCodeArr = new Array();
        var barCodeFlag = "";
        for(var i=0; i<results.length; i++) {
            global.sharedObject.barCodeNum++;
            var barCode = results[i].barcode;
            if(barCode != property_plc.BARCODE_MISS){
                if(csszMap.get("sfsm") != "1")  {
                    barCode = preStr + " " + dataformat.fillZero(global.sharedObject.barCodeNum, 8);
                }
            }
            if(barCode == property_plc.BARCODE_FAIL){
                barCodeFlag = "1" + barCodeFlag;
            } else {
                barCodeFlag = "0" + barCodeFlag;
            }
            checkBarCodeArr[checkBarCodeArr.length] = barCode;
            currentBarCodeArr[currentBarCodeArr.length] = barCode;
            //console.log('insertBarCode:' + results[i].barcode + "-----" + global.sharedObject.barCodeNum);
        }
        barCodeFlag = "1000" + barCodeFlag;
        plc.writeBarCodeFlag(barCodeFlag);
        //如果参数设置勾选了OCV筛选，则需要传递OCV数据给PLC
        fillOcvData(currentBarCodeArr);
        //结束后，调用回调函数
        callBack();
    });
}

//电性能检测结束处理
function checkProcess() {
    //判断距离上一次处理的时间差
    /*
    var newDate = new Date();
    var oldDate = global.sharedObject.lastProcessDate[1];
    if(oldDate != null && newDate-oldDate<timeInterval) {
        console.log('checkProcess:reset!!!!!!!!!!!');
        return;
    }
    console.log("checkCount:" + (++count_check));
    global.sharedObject.lastProcessDate[1] = newDate;
    */
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
        //避免因为PLC发了多次消息而导致的超出范围
        if(global.sharedObject.checkIndex<checkBarCodeArr.length) {
            for (var i = 0; i < property_plc.CHECK_NUM_SINGLE; i++) {
                //取之前保存的电芯条码，取出后，置空
                var checkBarCode = checkBarCodeArr[global.sharedObject.checkIndex];
                checkBarCodeArr[global.sharedObject.checkIndex] = null;
                global.sharedObject.checkIndex++;
                //console.log('getBarCode:' + "-----" + checkBarCode + "------" + global.sharedObject.checkIndex);
                if (checkBarCode == property_plc.BARCODE_MISS) {
                    var fillObj = {
                        dx: checkBarCode,
                        rl: "----",
                        nz: "----",
                        dy: "----",
                        ocv4: "----",
                        dyc: "----",
                        result: property_plc.BARCODE_MISS
                    };
                    dataArr_filltable[dataArr_filltable.length] = fillObj;
                } else {
                    var ng_reason = "";
                    if (checkBarCode == property_plc.BARCODE_FAIL) {
                        ng_reason += ";NG1";
                    }
                    if (!zztArr[i]) {
                        if (!dyztArr[i]) ng_reason += ";NG2";
                        if (!nzztArr[i]) ng_reason += ";NG3";
                        if (!rlztArr[i]) ng_reason += ";NG4";
                        if (!dycztArr[i]) ng_reason += ";NG5";
                    }
                    //如果扫码不良，肯定拿不到容量和OCV4数据，所以去掉NG4和NG5
                    if (ng_reason.indexOf(";NG1") != -1) {
                        ng_reason = ng_reason.replace(";NG4", "");
                        ng_reason = ng_reason.replace(";NG5", "");
                    }
                    if (ng_reason != "") ng_reason = ng_reason.substring(1);
                    var rl = "null";
                    var ocv4 = "null";
                    var dyc = "null";
                    var nz = nzArr[i];
                    if(typeof nzArr[i] != "undefined" && nzArr[i] != null && nzArr[i] != "") nz = nzArr[i].toFixed(3);
                    var dy = dyArr[i];
                    if(typeof dyArr[i] != "undefined" && dyArr[i] != null && dyArr[i] != "") dy = dyArr[i].toFixed(4);
                    if (csszMap.get("sjsx") == "1") {
                        var barInfo = excelMap.get(checkBarCode);
                        if (barInfo != null) {
                            rl = barInfo[1];
                            ocv4 = (parseFloat(barInfo[2]) / 1000).toFixed(3);
                            dyc = (parseFloat(barInfo[2]) / 1000 - dyArr[i]).toFixed(4);
                        }
                    }
                    //开始组建NG和正常列表
                    var barObj = {
                        sbh: csszMap.get("sbh"),
                        czrygh: csszMap.get("czrygh"),
                        scgd: csszMap.get("scgd"),
                        pc: csszMap.get("pc"),
                        dx: checkBarCode,
                        dy: dy,
                        dy_min: dyfwArr[0],
                        dy_max: dyfwArr[1],
                        nz: nz,
                        nz_min: nzfwArr[0],
                        nz_max: nzfwArr[1],
                        rl: rl,
                        rl_min: csszMap.get("sjsx") != "1" ? "null" : rlfwArr[0],
                        rl_max: csszMap.get("sjsx") != "1" ? "null" : rlfwArr[1],
                        ocv4: ocv4,
                        dyc: dyc,
                        dyc_min: dycfwArr[0],
                        dyc_max: dycfwArr[1],
                        dj: "null",
                        dj_min: "null",
                        dj_max: "null",
                        zxs: csszMap.get("zxs"),
                        ng_reason: ng_reason,
                        checkindex: i+1
                    };
                    if (ng_reason != "") {
                        global.sharedObject.ngCount++;
                        dataArr_ng[dataArr_ng.length] = barObj;
                    } else {
                        global.sharedObject.normalCount++;
                        normalBarArr[normalBarArr.length] = barObj;
                    }
                    //开始组建filltable列表
                    var fillObj = {
                        dx: checkBarCode,
                        rl: rl == "null" ? "----" : rl,
                        nz: nz,
                        dy: dy,
                        ocv4: ocv4 == "null" ? "----" : ocv4,
                        dyc: dyc == "null" ? "----" : dyc,
                        result: ng_reason == "" ? "√" : ng_reason,
                    };
                    dataArr_filltable[dataArr_filltable.length] = fillObj;
                }
            }
            //发送填充数据消息
            send_filltable(dataArr_filltable);
            //发送NG数据入库消息
            if (dataArr_ng.length > 0) send_ng(dataArr_ng);
        } else {
            console.log('-----------------checkIndex out!!!!!!!!!!!!!!!!!!!!!');
        }
        global.sharedObject.isFillOcvData = false;
    });
}

//打开打印机串口
const print = require(path.join(__dirname, 'app/communication/comm_print'));

//封箱结束处理
var getValue_plc = require(path.join(__dirname, 'app/controllers/tpsy/getValue_plc'));
function boxProcess() {
    //判断距离上一次处理的时间差
    /*
    var newDate = new Date();
    var oldDate = global.sharedObject.lastProcessDate[2];
    if(oldDate != null && newDate-oldDate<timeInterval) {
        console.log('boxProcess:reset!!!!!!!!!!!');
        return;
    }
    global.sharedObject.lastProcessDate[2] = newDate;
     */
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
        for(var i=0; i<normalBarArr.length; i++) {
            if(i < zxsInt) {
                normalBarArr[i].xh = xh;
                dataArr[dataArr.length] = normalBarArr[i];
            } else {
                newBarArr[newBarArr.length] = normalBarArr[i];
            }
        }
        global.sharedObject.normalBarArr = newBarArr;
        send_sealing(dataArr);
        //打印标签
        console.log("boxSize:" + dataArr.length);
        var csszMap = global.sharedObject.csszMap;
        if(csszMap.get("sfdyxh") == "1") {
            var printData = {
                sxdh:scgd,
                rlfw:csszMap.get("sfdyrlfw") == "1" ? rlfwStr.replace(";","-") : "",
                rld:rld,
                dyfw:dyfwStr.replace(";","-"),
                nzfw:nzfwStr.replace(";","-"),
                sl:dataArr.length,
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
            send_casenum(casenumArr);
        }
    });
}

function casenumPrint(printData) {
    print.write(print.getData_TP(printData));
}

//开始扫码监听，定时取数据库数据
function startPLC_barCode() {
    //先清空扫码数据表
    m_barcode.clearData(function(){
        //数据清理完成后，启动扫码监听
        global.sharedObject.scheduleBarCode = true;
        schedulePLC_barCode(function() {
            global.sharedObject.barCodeIndex = 0;
            startPLC_barCode();
        });
    });
}
function schedulePLC_barCode(stopCallBack) {
    if(!global.sharedObject.scheduleBarCode) {
        stopCallBack();
        return;
    }
    var isProcess = false;
    m_barcode.queryLastIndex(function (error, results, fields) {
        if (error) throw error;
        if(results.length > 0){
            var barCodeIndex = global.sharedObject.barCodeIndex;
            var lastIndex = parseInt(results[0].lastindex);
            if(lastIndex >= barCodeIndex + property_plc.CHECK_NUM_SINGLE) {
                global.sharedObject.barCodeIndex = barCodeIndex + property_plc.CHECK_NUM_SINGLE;
                isProcess = true;
                barCodeProcess(function() {
                    //等待处理完成后，重新开始扫码监听
                    setTimeout(function() {schedulePLC_barCode(stopCallBack)}, timerRun);
                });
            }
        }
        //如果不需要处理，则直接重新开始扫码监听
        if(!isProcess) setTimeout(function() {schedulePLC_barCode(stopCallBack)}, timerRun);
    });
}

//开始电性能检测监听，定时取标记位
function schedulePLC_check() {
    plc.readCheckFlag(function(flag){
        //电性能检测结束标记位
        if(flag) {
            //重置标记位
            plc.resetCheckFlag(function(error) {
                setTimeout(schedulePLC_check, timerRun);
                if(!error) checkProcess();
            });
        } else {
            setTimeout(schedulePLC_check, timerRun);
        }
    });
}
//开始箱号打印监听，定时取标记位
function schedulePLC_box() {
    plc.readBoxFlag(function(flag){
        //封箱标记位
        if(flag) {
            //重置标记位
            plc.resetBoxFlag(function(error) {
                setTimeout(schedulePLC_box, timerRun);
                if(!error) boxProcess();
            });
        } else {
            setTimeout(schedulePLC_box, timerRun);
        }
    });
}
//开始初始化监听，定时取标记位
function schedulePLC_init() {
    plc.readInitFlag(function(flag){
        //初始化标记位
        if(flag) {
            //重置标记位
            plc.resetInitFlag(function(error) {
                setTimeout(schedulePLC_init, timerInit);
                if(!error) initProcess();
            });
        } else {
            setTimeout(schedulePLC_init, timerInit);
        }
    });
}