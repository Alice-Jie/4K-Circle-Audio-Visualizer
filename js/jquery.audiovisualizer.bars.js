/*！
 * jQuery AudioVisualizer Bars plugin v0.0.1
 * project:
 * - https://github.com/Alice-Jie/4K-Circle-Audio-Visualizer
 * - https://git.oschina.net/Alice_Jie/circleaudiovisualizer
 * - http://steamcommunity.com/sharedfiles/filedetails/?id=921617616
 * @license MIT licensed
 * @author Alice
 * @date 2017/07/24
 */

(function (global, factory) {
    'use strict';
    if (typeof define === 'function' && define.amd) {
        define(['jquery'], function ($) {
            return factory($, global, global.document, global.Math);
        });
    } else if (typeof exports === "object" && exports) {
        module.exports = factory(require('jquery'), global, global.document, global.Math);
    } else if (global.layui && layui.define) {
        layui.define('jquery', function (exports) {
            exports(factory(layui.jquery, global, global.document, global.Math));
        });
    } else {
        factory(jQuery, global, global.document, global.Math);
    }
})(typeof window !== 'undefined' ? window : this, function ($, window, document, Math, undefined) {

    'use strict';

    //兼容requestAnimFrame、cancelAnimationFrame
    //--------------------------------------------------------------------------------------------------------------

    (function () {
        let lastTime = 0;
        let vendors = ['ms', 'moz', 'webkit', 'o'];
        for (let x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
            window.requestAnimationFrame = window[vendors[x] + 'RequestAnimationFrame'];
            window.cancelAnimationFrame = window[vendors[x] + 'CancelAnimationFrame'] || window[vendors[x] + 'CancelRequestAnimationFrame'];
        }

        if (!window.requestAnimationFrame)
            window.requestAnimationFrame = function (callback, element) {
                let currTime = new Date().getTime();
                let timeToCall = Math.max(0, 16 - (currTime - lastTime));
                let id = window.setTimeout(function () {
                        callback(currTime + timeToCall);
                    },
                    timeToCall);
                lastTime = currTime + timeToCall;
                return id;
            };

        if (!window.cancelAnimationFrame)
            window.cancelAnimationFrame = function (id) {
                clearTimeout(id);
            };
    }());

    //私有变量
    //--------------------------------------------------------------------------------------------------------------

    let canvas;                     // canvas对象
    let context;                    // context对象
    let canvasWidth, canvasHeight;  // canvas宽度和高度
    let originX, originY;           // 原点XY位置

    let minLength = 960;            // 最小宽度
    let startX, startY;             // 初始XY坐标

    // 坐标数组
    let pointArray1 = [],
        pointArray2 = [],
        staticPointsArray = [];

    // 上次音频数组记录
    let lastAudioSamples = [];
    for (let i = 0; i < 128; i++) {
        lastAudioSamples[i] = 0;
    }

    // 颜色变换
    let color1 = {
        R: 255,
        G: 255,
        B: 255
    }, color2 = {
        R: 255,
        G: 0,
        B: 0
    };
    let currantColor = '255,255,255';
    let colorDirection = 'left';

    let runCount = 1;  // 绘制次数

    let timer = null;  // 音频圆环计时器

    //私有方法
    //--------------------------------------------------------------------------------------------------------------

    /**
     *  检测音频数组静默状态
     *  数组所有值皆为0返回true,反之返回false
     *
     * @param  {Array<float>} audioSamples 音频数组
     * @return {boolean} 静默状态布尔值
     */
    function isSilence(audioSamples) {
        if (!audioSamples) {
            return false;
        }
        for (let i = 0; i < audioSamples.length; i++) {
            if (audioSamples[i] !== 0) {
                return true;
            }
        }
        return false;
    }

    /**
     * 根据点的数量提取音频数组
     * 获取数组长度等于点的数量的音频数组
     *
     * @param  {Array<float>} audioSamples 音频数组
     * @param  {int}          num          点的数量
     * @return {Array<float>} AudioArray   抽取后的音频数组
     */
    function getBarsArray(audioSamples, num) {
        if (!audioSamples) {
            return [];
        }
        if (!num || num <= 0) {
            return [];
        } else if (num > audioSamples.length) {
            return audioSamples;
        }
        let AudioArray = [].concat(audioSamples);
        let max = AudioArray.length - num;
        let isfirst = true;  // 头尾元素指示器
        for (let i = 0; i < max; i++) {
            if (isfirst) {
                AudioArray.shift();
                isfirst = false;
            } else {
                AudioArray.pop();
                isfirst = true;
            }
        }
        return AudioArray;
    }

    /**
     * 比较并获取音频数组索引对应值
     * 若小于上一个点的音频数组索引对应值，则取上次记录对应值，反之取当前索引对应值
     * decline保证音频数组衰退时，音频圆环能平缓收缩，而不是突然变回圆形
     * 当然，decline越小过渡越缓慢，越大过渡越迅速（甚至失效）
     *
     * @param {Array<float>}   audioSamples 音频数组
     * @param {int}            index        音频数组索引
     * @param {float}          decline      衰退值
     * @param {float}          peak         峰值
     * @param {boolean<float>} isUpdate     是否更新上次音频数组记录
     * @return 音频取样值
     */
    function getAudioSamples(audioSamples, index, decline, peak, isUpdate) {
        if (!audioSamples) {
            return [];
        }
        decline = decline || 0.01;
        let audioValue = audioSamples[index] ? audioSamples[index] : 0;
        audioValue = Math.max(audioValue, lastAudioSamples[index] - decline);
        audioValue = Math.min(audioValue, peak);
        if (isUpdate) {
            lastAudioSamples[index] = audioValue;
        }
        return audioValue;
    }


    /**
     * 通过RGB字符串更新RGB颜色对象
     * 字符串格式为"R,B,G"，例如："255,255,255"
     *
     * @param {!Object} colorObj RGB颜色对象
     * @param {string}  colorStr RGB颜色字符串
     */
    function setColorObj(colorObj, colorStr) {
        colorObj.R = parseInt(colorStr.split(",")[0]);
        colorObj.G = parseInt(colorStr.split(",")[1]);
        colorObj.B = parseInt(colorStr.split(",")[2]);
    }

    /**
     * 设置随机RGB颜色对象
     * 随机生成0-255范围内RGB颜色
     *
     * @param {!Object} colorObj RGB颜色对象
     */
    function setRandomColor(colorObj) {
        colorObj.R = Math.floor(255 * Math.random());
        colorObj.G = Math.floor(255 * Math.random());
        colorObj.B = Math.floor(255 * Math.random());
    }

    //构造函数和公共方法
    //--------------------------------------------------------------------------------------------------------------

    /**
     *  初始化VisualizerBars
     *
     * @param {!Object} el      被选中的节点
     * @param {Object}  options 参数对象
     */
    let VisualizerBars = function (el, options) {
        this.$el = $(el);

        // 全局参数
        this.opacity = options.opacity;                        // 不透明度
        this.color = options.color;                            // 颜色
        this.shadowColor = options.shadowColor;                // 阴影颜色
        this.shadowBlur = options.shadowBlur;                  // 模糊大小
        this.isChangeColor = options.isChangeColor;            // 颜色变换开关
        this.isRandomColor = options.isRandomColor;            // 随机颜色开关
        this.firstColor = options.firstColor;                  // 起始颜色
        this.secondColor = options.secondColor;                // 最终颜色
        this.isChangeBlur = options.isChangeBlur;              // 模糊变换开关
        // 坐标参数
        this.offsetX = options.offsetX;                        // X坐标偏移
        this.offsetY = options.offsetY;                        // Y坐标偏移
        this.isClickOffset = options.isClickOffset;            // 鼠标坐标偏移
        // 音频参数
        this.amplitude = options.amplitude;                    // 振幅
        this.decline = options.decline;                        // 衰退值
        this.peak = options.peak;                              // 峰值
        // 条形参数
        this.isBars = options.isBars;                          // 显示条形
        this.isLineTo = options.isLineTo;                      // 显示连线
        this.width = options.width;                            // 宽度比例
        this.height = options.height;                          // 基础高度
        this.pointNum = options.pointNum;                      // 点的数量
        this.barsRotation = options.barsRotation;              // 旋转角度
        this.barsDirection = options.barsDirection;            // 条形方向
        this.lineWidth = options.lineWidth;                    // 条形宽度
        this.milliSec = options.milliSec;                      // 重绘间隔

        // 创建并初始化canvas
        canvas = document.createElement('canvas');
        canvas.id = 'canvas-visualizerbars'; // canvas ID
        $(canvas).css({
            'position': 'absolute',
            'top': 0,
            'left': 0,
            'z-index': 2,
            'opacity': this.opacity
        });  // canvas CSS
        canvasWidth = canvas.width = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
        canvasHeight = canvas.height = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;

        // 获取最小宽度、原点XY坐标和初始XY坐标
        minLength = canvasWidth * this.width;
        originX = canvasWidth * this.offsetX;
        originY = canvasHeight * this.offsetY;
        startX = originX - minLength / 2;
        startY = originY;

        // 创建并初始化绘图的环境
        context = canvas.getContext('2d');
        context.fillStyle = 'rgb(' + this.color + ')';
        // 线条属性
        context.lineWidth = this.lineWidth;
        context.strokeStyle = 'rgb(' + this.color + ')';
        // 阴影属性
        context.shadowColor = 'rgb(' + this.shadowColor + ')';
        context.shadowBlur = this.shadowBlur;
        // 颜色对象
        setColorObj(color1, this.firstColor);
        setColorObj(color2, this.secondColor);

        $(this.$el).append(canvas);  // 添加canvas

        // 默认开启
        this.setupPointerEvents();
        this.updateVisualizerBars(lastAudioSamples);
        this.drawVisualizerBars();
    };

    // 默认参数
    VisualizerBars.DEFAULTS = {
        // 全局参数
        opacity: 0.90,               // 不透明度
        color: '255,255,255',        // 颜色
        shadowColor: '255,255,255',  // 阴影颜色
        shadowBlur: 15,              // 模糊大小
        isChangeColor: false,        // 颜色变换开关
        isRandomColor: true,         // 随机颜色变换
        firstColor: '255,255,255',   // 起始颜色
        secondColor: '255,0,0',      // 最终颜色
        isChangeBlur: false,         // 模糊颜色变换开关
        // 坐标参数
        offsetX: 0.5,                // X坐标偏移
        offsetY: 0.9,                // Y坐标偏移
        isClickOffset: false,        // 鼠标坐标偏移
        // 音频参数
        amplitude: 5,                // 振幅
        decline: 0.2,                // 衰退值
        peak: 1.5,                   // 峰值
        // 线条参数
        isBars: true,                // 显示条形
        isLineTo: false,             // 显示连线
        width: 0.5,                  // 宽度比例
        height: 2,                   // 基础高度
        pointNum: 120,               // 点的数量
        barsRotation: 0,             // 旋转角度
        barsDirection: "two bars",   // 条形方向
        lineWidth: 5,                // 条形宽度
        milliSec: 30                 // 重绘间隔
    };

    // 公共方法
    VisualizerBars.prototype = {

        // 面向内部方法
        //-----------------------------------------------------------

        /**
         * 生成静态点的坐标集合
         * 生成静态音频条形坐标数组
         *
         * @param  {Array<float>}   audioSamples 音频数组
         * @return {Array<Object>} 坐标数组
         */
        setStaticPoint: function (audioSamples) {
            let pointArray = [];
            let barsArray = getBarsArray(audioSamples, this.pointNum);
            let spacing = minLength / (barsArray.length - 1);
            // 将barsArray.length点数组转换成中央左侧坐标数组
            for (let i = 0; i < barsArray.length; i++) {
                let x = startX + i * spacing;
                pointArray.push({x: x, y: originY});
            }
            return pointArray;
        },

        /**
         * 生成音频条形点的坐标集合
         * 根据音频数组值生成对应点坐标，并储存在坐标数组中
         *
         * @param  {Array<float>}   audioSamples 音频数组
         * @param  {int}            direction    方向（1或则-1）
         * @param  {boolean<float>} isChange     更新lastAudioSamples[index]布尔值
         * @return {Array<Object>} 坐标数组
         */
        setPoint: function (audioSamples, direction, isChange) {
            let pointArray = [];
            let barsArray = getBarsArray(audioSamples, this.pointNum);
            let spacing = minLength / (barsArray.length - 1);
            // 将barsArray.length点数组转换成坐标数组
            for (let i = 0; i < barsArray.length; i++) {
                let audioValue = getAudioSamples(audioSamples, i, this.decline, this.peak, isChange);
                let x = startX + i * spacing;
                let y = originY + direction * (this.height + audioValue * this.amplitude * 15);
                pointArray.push({x: x, y: y});
            }
            return pointArray;
        },

        /**
         * 绘制音频连线
         * 根据坐标数组绘制音频条形
         *
         *  @param {Array<Object>} pointArray 坐标数组
         */
        drawLine: function (pointArray) {
            context.save();
            context.beginPath();
            context.moveTo(pointArray[0].x, pointArray[0].y);
            for (let i = 1; i < pointArray.length; i++) {
                context.lineTo(pointArray[i].x, pointArray[i].y);
            }
            context.stroke();
            context.closePath();
            context.restore();
        },

        /**
         * 绘制音频条形
         * 根据坐标数组绘制上条形、下条形以及静态条形之间连线
         *
         *  @param {Array<Object>} pointArray1 坐标数组1
         *  @param {Array<Object>} pointArray2 坐标数组2
         */
        drawBars: function (pointArray1, pointArray2) {
            context.save();
            context.beginPath();
            let max = Math.min(pointArray1.length, pointArray2.length);
            for (let i = 0; i < max; i++) {
                context.moveTo(pointArray1[i].x, pointArray1[i].y);
                context.lineTo(pointArray2[i].x, pointArray2[i].y);
            }
            context.closePath();
            context.stroke();
            context.restore();
        },


        /** 音频圆环和小球颜色变换 */
        colorTransformation: function () {
            if (color1.R !== color2.R
                || color1.G !== color2.G
                || color1.B !== color2.B) {
                // "R"值比较
                if (color1.R > color2.R) {
                    color1.R--;
                } else if (color1.R < color2.R) {
                    color1.R++;
                }
                // "G"值比较
                if (color1.G > color2.G) {
                    color1.G--;
                } else if (color1.G < color2.G) {
                    color1.G++;
                }
                // "B"值比较
                if (color1.B > color2.B) {
                    color1.B--;
                } else if (color1.B < color2.B) {
                    color1.B++;
                }
                // 改变context颜色属性
                currantColor = color1.R + ',' + color1.G + ',' + color1.B;
                context.fillStyle = 'rgb(' + currantColor + ')';
                context.strokeStyle = 'rgb(' + currantColor + ')';
                if (this.isChangeBlur) {
                    context.shadowColor = 'rgb(' + currantColor + ')';
                }
            } else if (colorDirection === 'left' && this.isRandomColor === false) {
                // 反方向改变颜色
                setColorObj(color1, this.secondColor);
                setColorObj(color2, this.firstColor);
                colorDirection = 'right';
            } else if (colorDirection === 'right' && this.isRandomColor === false) {
                // 正方向改变颜色
                setColorObj(color1, this.firstColor);
                setColorObj(color2, this.secondColor);
                colorDirection = 'left';
            } else if (this.isRandomColor === true) {
                // 随机生成目标颜色
                setColorObj(color1, currantColor);
                setRandomColor(color2);
            }
        },


        /** 设置交互事件 */
        setupPointerEvents: function () {

            // 点击事件
            let that = this;
            $(this.$el).on('click', function (e) {
                if (that.isClickOffset) {
                    let x = e.clientX;
                    let y = e.clientY;
                    that.offsetX = x / canvasWidth;
                    that.offsetY = y / canvasHeight;
                    that.updateVisualizerBars(lastAudioSamples);
                    that.drawVisualizerBars();
                }
            });

            // 窗体改变事件
            $(window).on('resize', function () {
                // 改变宽度和高度
                canvasWidth = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
                canvasHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
                // 获取最小宽度以及原点
                minLength = Math.min(canvasWidth, canvasHeight);
                originX = canvasWidth * this.offsetX;
                originY = canvasHeight * this.offsetY;
                that.updateVisualizerBars(lastAudioSamples);
                that.drawVisualizerBars();
            });

        },

        // 面向外部方法
        //-----------------------------------------------------------

        /** 清除Canvas内容 */
        clearCanvas: function () {
            context.clearRect(0, 0, canvasWidth, canvasHeight);
        },

        /**
         * 更新音频条形参数
         * 更新条形坐标数组、偏移角度、原点坐标和音频条形颜色
         *
         * @param {Array<float>} audioSamples 音频数组
         */
        updateVisualizerBars: function (audioSamples) {
            // 更新宽度、原点坐标坐标以及初始XY坐标
            minLength = canvasWidth * this.width;
            originX = canvasWidth * this.offsetX;
            originY = canvasHeight * this.offsetY;
            startX = originX - minLength / 2;
            startY = originY;
            // 更新坐标数组
            staticPointsArray = this.setStaticPoint(audioSamples);
            pointArray1 = this.setPoint(audioSamples, -1, true);
            pointArray2 = this.setPoint(audioSamples, 1, false);
            // 更新音频圆环小球颜色
            if (this.isChangeColor) {
                this.colorTransformation();
            }
        },

        /** 绘制音频条形 */
        drawVisualizerBars: function () {
            context.clearRect(0, 0, canvasWidth, canvasHeight);
            // 旋转canvas内容
            context.save();
            context.translate(startX + minLength / 2, startY);
            context.rotate((Math.PI / 180) * this.barsRotation);
            context.translate(-startX - minLength / 2, -startY);
            // 绘制连线
            if (this.isLineTo) {
                switch (this.barsDirection) {
                    case  'upper bars':
                        this.drawLine(pointArray1);
                        break;
                    case 'lower bars':
                        this.drawLine(pointArray2);
                        break;
                    case 'two bars':
                        this.drawLine(pointArray1);
                        this.drawLine(pointArray2);
                        break;
                    default:
                        this.drawLine(pointArray1);
                        this.drawLine(pointArray2);
                }
            }
            // 绘制条形
            if (this.isBars) {
                let firstArray = pointArray1;
                let secondArray = pointArray2;
                //alert(this.barsDirection);
                switch (this.barsDirection) {
                    case  'upper bars':
                        firstArray = pointArray1;
                        secondArray = staticPointsArray;
                        break;
                    case 'lower bars':
                        firstArray = staticPointsArray;
                        secondArray = pointArray2;
                        break;
                    case 'two bars':
                        firstArray = pointArray1;
                        secondArray = pointArray2;
                        break;
                    default:
                        firstArray = pointArray1;
                        secondArray = pointArray2;
                }
                this.drawBars(firstArray, secondArray);
            }
            context.restore();
        },

        /**
         * 根据音频数组绘制音频条形
         * 当上次音频数组记录和当前音频数组不处于静默状态、颜色变换状态、绘制条形
         *
         * @param  {Array<float>} audioSamples 音频数组
         */
        drawCanvas: function (audioSamples) {
            this.updateVisualizerBars(audioSamples);
            if (isSilence(audioSamples)
                || isSilence(lastAudioSamples)
                || this.isChangeColor
                || this.isBars
                || this.isLineTo) {
                this.drawVisualizerBars();
                runCount = 1;
            } else if (runCount > 0) {
                this.drawVisualizerBars();
                runCount--;
            }
        },


        /** 停止音频圆环计时器 */
        stopVisualizerBarsTimer: function () {
            if (timer) {
                clearTimeout(timer);
            }
        },

        /** 运行音频圆环计时器 */
        runVisualizerBarsTimer: function () {
            timer = setTimeout(
                ()=> {
                    // 缺少静态判断
                    this.drawVisualizerBars();
                    this.runVisualizerBarsTimer();
                }, this.milliSec);
        },


        /** 移除canvas */
        destroy: function () {
            this.$el
                .off('#canvas-visualizerbars')
                .removeData('visualizerbars');
            $('#canvas-visualizerbars').remove();
        },

        /**
         * 修改参数
         *
         * @param {string} property 属性名
         * @param {*}      value    属性对应值
         */
        set: function (property, value) {
            switch (property) {
                case 'opacity':
                    $(canvas).css('opacity', value);
                    break;
                case 'color':
                    context.fillStyle = 'rgb(' + value + ')';
                    context.strokeStyle = 'rgb(' + value + ')';
                    this.drawVisualizerBars();
                    break;
                case 'shadowColor':
                    context.shadowColor = 'rgb(' + value + ')';
                    this.drawVisualizerBars();
                    break;
                case 'shadowBlur':
                    context.shadowBlur = value;
                    this.drawVisualizerBars();
                    break;
                case 'lineWidth':
                    context.lineWidth = value;
                    this.drawVisualizerBars();
                    break;
                case 'isChangeColor':
                case 'isRandomColor':
                case 'isChangeBlur':
                case 'isClickOffset':
                case 'amplitude':
                case 'decline':
                case 'peak':
                case 'milliSec':
                    this[property] = value;
                    break;
                case 'firstColor':
                    this.firstColor = value;
                    setColorObj(color1, value);
                    break;
                case 'secondColor':
                    this.secondColor = value;
                    setColorObj(color2, value);
                    break;
                case 'offsetX':
                case 'offsetY':
                case 'isBars':
                case 'isLineTo':
                case 'width':
                case 'height':
                case 'pointNum':
                case 'barsRotation':
                case 'barsDirection':
                    this[property] = value;
                    this.updateVisualizerBars(lastAudioSamples);
                    this.drawVisualizerBars();
                    break;
            }
        }

    };

    //定义VisualizerBars插件
    //--------------------------------------------------------------------------------------------------------------

    let old = $.fn.visualizerbars;

    $.fn.visualizerbars = function (option) {
        let args = (arguments.length > 1) ? Array.prototype.slice.call(arguments, 1) : undefined;

        return this.each(function () {
            let $this = $(this);
            let data = $this.data('visualizerbars');
            let options = $.extend({}, VisualizerBars.DEFAULTS, $this.data(), typeof option === 'object' && option);

            if (!data && typeof option === 'string') {
                return;
            }
            if (!data) {
                $this.data('visualizerbars', (data = new VisualizerBars(this, options)));
            }
            else if (typeof option === 'string') {
                VisualizerBars.prototype[option].apply(data, args);
            }
        });
    };

    $.fn.visualizerbars.Constructor = VisualizerBars;

    // 确保插件不冲突
    $.fn.visualizerbars.noConflict = function () {
        $.fn.audiovisualize = old;
        return this;
    };

});