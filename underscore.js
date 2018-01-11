(function () {

    var root = typeof self == 'object' && self.self === self ||
        typeof global == 'object' && global.global === global && global ||
        this || {}

    // 将全局变量进行缓存，供后面 noConflict 使用
    var previousUnderscore = root._;


    // 保存变量，便于压缩，这里的压缩不是 gzip 压缩，是压缩到 .min.js中
    var ArrayProto = Array.prototype,
        ObjProto = Object.prototype,
        SymbolProto = typeof Symbol !== 'undefined' ? Symbol.prototype : null;


    // 为引用原型上的方法创建快速的引用
    var push = ArrayProto.push,
        slice = ArrayProto.slice,
        toString = ObjProto.toString,
        hasOwnProperty = ObjProto.hasOwnProperty;


    // 一些 es5 原生方法的引用
    var nativeIsArray = Array.isArray,
        nativeKeys = Object.keys,
        nativeCreate = Object.create;


    var Ctor = function () {}



    // 核心函数开始

    var _ = function (obj) {
        if (obj instanceof _) return obj;

        // 为了防止直接调用 _(obj) 情况，这样的话，就直接 new 一下函数
        // 这里你可能有疑问了，这里都是 return 了，，那么下面的 this._wrapped = obj 还能否执行呢？
        // 答案是肯定的，这里涉及 new 一个对象时的具体过程，可以参考如下：
        // https://github.com/jyzwf/blog/issues/27
        // object instanceof constructor
        // 同时 instanceof 运算符用来检测 constructor.prototype 是否存在于参数 object 的原型链上
        // 这样就可以理解了
        if (!(this instanceof _)) return new _(obj)

        this._wrapped = obj;
    }


    // 暴露 Underscore 对象给 nodejs，为了更好的向后兼容其老的API,
    // 如果我们运行在浏览器中，添加 " _ " 作为全局对象
    // nodeType 是确保 `module` 和 `exports` 不是 HTML 的元素
    if (typeof exports != 'undefined' && !exports.nodeType) {
        if (typeof module != 'undefined' && !module.nodeType && module.exports) {
            exports = module.exports = _;
        }

        exports._ = _;
    } else {
        root._ = _;
    }


    // 当前版本
    _.VERSION = '1.8.3';


    // 通过包装，使传进来的回调函数更加高效，在内部供多个函数使用，通俗来说绑定this，并返回一些回调函数，func必须是函数
    var optimizeCb = function (func, context, argCount) {
        if (context === void 0) return func

        switch (argCount) {
            case 1:
                return function (value) {
                    return func.call(context, value)
                };
                // _.each()、_.map()里使用
            case null:
            case 3:
                return function (value, index, collection) {
                    return func.call(context, value, index, collection)
                };

                // _.reduce()、_.reduceRight()使用
            case 4:
                return function (accumulator, value, index, collection) {
                    return func.call(context, accumulator, value, index, collection)
                }
        }

        // 至于为啥有上面的一系列的case 判断，并且调用 .call()，见下面
        // https://github.com/jyzwf/blog/issues/32
        return function () {
            return func.apply(context, arguments)
        }
    }


    var buildinIteratee;


    // 一个内部函数，产生可以运用到集合中每个元素的回调函数
    var cb = function (value, context, argCount) {

        // 为啥要加上这个？
        if (_.iteratee !== buildinIteratee) return _.iteratee(value, context)

        if (value == null) return _.identity;

        if (isFunction(value)) return optimizeCb(value, context, argCount)

        if (isObject(value) && !_.isArray(value)) return _.matcher(value)

        return _.property(value)
    }


    // 用来生成可应用到集合中每个元素的回调， 返回想要的结果 - 无论是等式，
    // 任意回调，属性匹配，或属性访问
    _.iteratee = buildinIteratee = function (value, context) {
        return cb(value, context, Infinity)
    }


    // 类似es6的剩余参数集合
    // ？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？
    var restArgs = function (func, startIndex) {
        startIndex = startIndex == null ? func.length - 1 : +startIndex

        return function () {
            var length = Math.max(arguments.length - startIndex, 0), // 防止startIndex 过大
                rest = Array(length),
                index = 0;

            for (; index < length; index++) { // 将从startIndex开始的后面参数放入数组
                rest[index] = arguments[index + startIndex]
            }

            // switch 干嘛的？？？？？？？？？？？？？
            switch (startIndex) {
                case 0:
                    return func.call(this, rest);
                case 1:
                    return func.call(this, arguments[0], rest);

                    // 在_.invoke()使用
                case 2:
                    return func.call(this, arguments[0], arguments[1], rest);
            }

            // 收集startIndex 之前的参数，并将 startIndex 开始的后面的参数包装为一个数组使用
            var args = Array(startIndex + 1);
            for (index = 0; index < startIndex; index++) {
                args[index] = arguments[index]
            }

            // 将args的最后一个参数设置为之前的 rest
            args[startIndex] = rest;
            return func.apply(this, args)
        }
    }


    // 创建一个新对象继承与其他对象
    var baseCreate = function (prototype) {
        if (!_.isObject(prototype)) return {};

        if (nativeCreate) return nativeCreate(prototype);

        Ctor.prototype = prototype;
        var result = new Ctor;

        // new 完之后将Ctor 的原型置为 null ,避免污染
        Ctor.prototype = null;
        return result;
    }



    // 返回指定对象的属性值
    var shallowProperty = function (key) { // 柯里化
        return function (obj) {
            return obj == null ? void 0 : obj[key]
        }
    }

    /**
     * 
     * @param {*} obj
     * obj = {
     *  a:{
     *      b:{
     *          c:{
     *              d:{}
     *          }
     *       }
     *    }
     * } 
     * @param {*Array} path 
     * path:['a','b','c','d']
     * 
     * return obj.a.b.c.d
     */
    var deepGet = function (obj, path) {
        var length = path.length
        for (var i = 0; i < length; i++) {
            if (obj == null) return void 0;
            obj = obj[path[i]] // 变量替换
        }

        return length ? obj : void 0;
    }

    // JavaScript 中能精确表示的最大数字
    var MAX_ARRAY_INDEX = Math.pow(2, 53) - 1;

    // 获取数组或者类数组的 length 属性
    var getLength = shallowProperty('length');

    // 判断是否是类数组
    // 包括数组，NodeList,arguments等
    // 以及字符串，函数，和自己的函数 如 {a:1,length:1}
    var isArrayLike = function (collection) {
        var length = getLength(collection);
        return typeof length == 'number' && length >= 0 && length <= MAX_ARRAY_INDEX;
    }




    // 适用于集合函数
    // ----------------------------------


    // 对于数组或者类数组或者对象的每一个元素调用相应的迭代方法
    // 注：该方法不能用 return 跳出循环
    _.each = _.forEach = function (obj, iteratee, context) {
        iteratee = optimizeCb(iteratee, context); // 绑定 this
        var i, length;

        if (isArrayLike(obj)) {
            for (i = 0, length = obj.length; i < length; i++) {
                iteratee(obj[i], i, obj)
            }
        } else {
            var key = _.keys(obj)
            for (i = 0, length = keys.length; i < length; i++) {
                iteratee(obj[keys[i]], keys[i], obj)
            }
        }
    }


    // 这里 _.each 和 _.map 为啥一个是调用optimizeCb，一个是 cb呢？
    // 因为 _.each里面的iteratee必须是函数，而 _.map 里面的可以是 字符串，如下：
    // var results = _.map([{name:'cxp'},{name:'comma'}],'name'); // => results: ['cxp', 'comma'];
    // 参考于：https://github.com/hanzichi/underscore-analysis/issues/4
    _.map = _.collection = function (obj, iteratee, context) {
        iteratee = cb(iteratee, context);
        var keys = !isArrayLike(obj) && _.keys(obj),
            length = (keys || obj).length,
            results = Array(length);

        // 补充一下 && 、|| 返回值问题
        // expr1 && expr2 ：如果expr1 能转换成false则返回expr1，否则返回expr2。因此，与布尔值一起使用时，如果两个操作数都为true时&&返回true，否则返回false
        // expr1 || expr2：如果expr1能转换成true则返回expr1，否则返回expr2。因此，与布尔值一起使用时，如果任意一个操作数为true时||返回true

        for (var index = 0; index < length; index++) {
            var currentKey = keys ? keys[index] : index;
            results[index] = iteratee(obj[currentKey], currentKey, obj)
        }

        return results
    }


    var createReduce = function (dir) {
        // 指定dir 可以很好的做好从左到右或者从又到左迭代的情况


        /**
         * 
         * @param {*Array | Object} obj 
         * @param {* } iteratee 
         * @param {*} memo ：最开始的iteratee的第一个参数
         * @param {*} initial 
         */
        var reducer = function (obj, iteratee, memo, initial) {
            var keys = !isArrayLike(obj) && _.keys(obj),
                length = (keys || obj).length,
                index = dir > 0 ? 0 : length - 1;

            if (!initial) { // 如果只有两个参数，就是没有指定最开的值，则将obj的第一个元素作为 iteratee 的第一个参数，同时将迭代的初始值向前或向后一位
                memo = obj[keys ? keys[index] : index];
                index += dir // 体现 使用 dir 变量，而不是 具体数值的好处
            }

            for (; index >= 0 && index < length; index += dir) {
                var currentKey = keys ? keys[index] : index;
                memo = iteratee(memo, obj[currentKey], currentKey, obj)
            }

            return memo
        }

        return function (obj, iteratee, memo, context) {
            var initial = arguments.length >= 3 // 判断是否是有指定初始值和this 
            return reducer(obj, optimizeCb(iteratee, context, 4), memo, initial)
        }
    }



    _.reduce = _.foldl = _.inject = createReduce(1)

    _.reduceRight = _.foldr = createReduce(-1)


    _.find = _.detect = function (obj, predicate, context) {
        var keyFinder = isArrayLike(obj) ? _.findIndex : _.findKey
        var key = keyFinder(obj, predicate, context);
        if (key !== void 0 && key !== -1) return obj[key] // 没找到呢，直接返回 undefine
    }



    _.filter = _.select = function (obj, predicate, context) {
        var results = []
        predicate = cb(predicate, context)

        // 使用 前面的 _.each()来迭代每一个元素，找到所有通过predicate真值检测的元素值
        _.each(obj, function (value, index, list) {
            if (predicate(value, index, list)) results.push(value)
        })


        return results
    }


    // 返回 obj 中没有通过predicate真值检测的元素集合
    _.reject = function (obj, predicate, context) {
        // 对于 _.negate()和 _.filter的结合的实现巧妙，将predicate包装一层，再返回一个新函数给filter，然后在新函数里面取反
        // ！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！
        return _.filter(obj, _.negate(cb(predicate)), context)
    }


    // 检测集合中的每个值是否全部通过 predicate 的检测，全通过就返回 true，反之为false
    _.every = _.all = function (obj, predicate, context) {
        predicate = cb(predicate, context);

        var keys = !isArrayLike(obj) && _.keys(obj),
            length = (keys || obj).length;

        for (var index = 0; index < length; index++) {
            var currentKey = keys ? keys[index] : index; // 三目运算为真则不为类数组的对象，反之为类数组
            if (!predicate(obj[currentKey], currentKey, obj)) return false; // 只要有一个在predicate中检测为假，就返回false
        }

        return true
    }



    // 检测集合中的每个值是否有通过 predicate 的检测的值，有一个通过就返回 true，反之为false
    _.some = _.any = function (obj, predicate, context) {
        predicate = cb(predicate, context)

        var keys = !isArrayLike(obj) && _.keys(obj),
            length = (keys || obj).length;

        for (var index = 0; index < length; index++) {
            var currentKey = keys ? keys[index] : index;
            // 这部分代码与上面基本一样，不过作用是只要在集合中通过 predicate 检测，只要有一个为 真，就返回 true
            if (predicate(obj[currentKey], currentKey, obj)) return true;
        }

        return false
    }


    // 判断集合中是否存在给定的 值
    _.contains = _.includes = _.include = function (obj, item, fromIndex, guard) {
        if (!isArrayLike(obj)) obj = _.values(obj)

        // 从何处开始找，
        // guard 干嘛用？？？？？？？？？？？？？？？？？？？？
        if (typeof fromIndex != 'number' || gurad) fromIndex = 0;

        // 调用_.indexOf来做具体的判断
        return _.indexOf(obj, item, fromIndex) >= 0
    }


    // 在obj的每个元素上执行path方法， 任何传递给invoke的额外参数，invoke都会在调用 path方法的时候传递给它。
    // 6666666666666666666666666666666666666666666666666666666666666666666666666666666666666666
    _.invoke = restArgs(function (obj, path, args) {
        var contextPath, func

        if (_.isFunction(path)) { // 执行的函数来源于外在的定义的函数
            func = path
        } else if (_.isArray(path)) { // 执行的函数来源于集合每个元素内部自己定义的函数
            // path 是数组
            contextPath = path.slice(0, -1); // 除去数组中的最后一个元素
            path = path[path.length - 1] // 将path 赋值为 path 中的最后一个元素
        }

        return _.map(obj, function (context) {
            var method = func;
            if (!method) {
                // contextPath存在，并且有值，意味着path 是数组，并且是obj 每个对象对应的方法
                if (contextPath && contextPath.length) {
                    context = deepGet(context, contextPath);
                }

                if (context == null) return void 0;
                /* 
                                obj = [
                                    {
                                        a: {
                                            b: function () {
                                                console.log('c')
                                            }
                                        }
                                    },
                
                                    {
                                        a: {
                                            b: function () {
                                                console.log('c')
                                            }
                                        }
                                    },
                
                                    {
                                        a: {
                                            b: function () {
                                                console.log('c')
                                            }
                                        }
                                    }
                                ]
                
                                最初 path = ['a', 'b'];

                                经过 path = path[path.length - 1] 后
                                path = 'b'
                                contextPath = ['a']
                
                                则通过 deepGet获取到的就是：
                               {
                                    b: function () {
                                        console.log('c')
                                    }
                                }
                                然后执行该函数
                
                 */
                // 这时的在invoke 调用的是集合中的每个元素自己相对用的值
                // 这里获取到的就是 
                /** 
                function () {
                    console.log('c')
                } 
                */
                method = context[path]
            }

            // 如果method 是空，就直接返回该值，否则执行这个函数，并指定上下文
            return method == null ? method : method.apply(context, args)
        })
    })


    // 萃取数组对象中某属性值，返回一个数组
    _.pluck = function (obj, key) {
        return _.map(obj, _.property(key))
    }



    // 遍历obj里的每一个值，返回一个数组，这个数组里的元素包含attrs 所列出的键值对，使用 filter 过滤
    _.where = function (obj, attrs) {
        return _.filter(obj, _.matcher(attrs))
    }


    // 与上面大致相同，只是找到第一个符合条件的值，使用 find 查找
    _.findWhere = function (obj, attrs) {
        return _.find(obj, _.matcher(attrs))
    }




    _.max = function (obj, iteratee, context) {
        // reslut 确保最小
        var result = -Infinity,
            lastComputed = -Infinity,
            value, computed;

        //  && 优先级 大于 || 
        if (iteratee == null || (typeof iteratee == 'number' && typeof obj[0] != 'object') && obj != null) { // 单纯的比较
            // 如果没有指定比较的条件函数 或者iteratee 是数字且obj 的第一个元素不是 obj,obj又存在
            // 这里为什么要判断 typeof obj[0] != 'object'？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？
            obj = isArrayLike(obj) ? obj : _.values(obj)
            // 循环对象的值或者类数组
            for (var i = 0, length = obj.length; i < length; i++) {
                value = obj[i];
                if (value != null && value > result) { // 如果value 存在，摈弃大于现在的最大值
                    result = value
                }
            }
        } else {
            iteratee = cb(iteratee, context) //比较条件由函数产生
            _.each(obj, function (v, index, list) {
                completed = iteratee(v, index, list);
                // -Infinity>-Infinity ->>false
                if (completed > lastComputed || computed === -Infinity && result === -Infinity) {
                    result = v; // 保存键值。
                    lastComputed = computed // 保存计算得出的值
                }
            })
        }

        return reslut
    }



    // 找到最小的，与上面大致一样
    _.min = function (obj, iteratee, context) {
        var result = Infinity,
            lastComputed = Infinity,
            value, computed;
        if (iteratee == null || (typeof iteratee == 'number' && typeof obj[0] != 'object') && obj != null) {
            obj = isArrayLike(obj) ? obj : _.values(obj);
            for (var i = 0, length = obj.length; i < length; i++) {
                value = obj[i];
                if (value != null && value < result) {
                    result = value;
                }
            }
        } else {
            iteratee = cb(iteratee, context);
            _.each(obj, function (v, index, list) {
                computed = iteratee(v, index, list);
                if (computed < lastComputed || computed === Infinity && result === Infinity) {
                    result = v;
                    lastComputed = computed;
                }
            });
        }
        return result;
    }


    // 随机乱序
    _.shuffle = function (obj) {
        return _.sample(obj, Infinity);
    }


    // 从 list中产生一个随机样本。
    // 传递一个数字表示从list中返回n个随机元素。否则将返回一个单一的随机项
    _.sample = function (obj, n, guard) {
        if (n == null || guard) { // 如果 n不存在或者 guard 不存在或为 false
            if (!isArrayLike(obj)) obj = _.values(obj) // 得到对象所有的值
            return obj[_.random(obj.length - 1)] // 随机返回一个值
        }

        var sample = isArrayLike(obj) ? _.clone(obj) : _.values(obj) // 如果对象是类数组，就拷贝该数组，否则，直接获取其键值
        var length = getLength(sample)

        // 确保 n 在 0 - length 之间；
        n = Math.max(Math.min(n, length), 0)
        var last = length - 1

        // 使用洗牌算法，具体参见：
        // https://github.com/jyzwf/blog/issues/34
        for (var index = 0; index < n; index++) {
            var rand = _.random(index, last)
            var temp = sample[index]
            sample[index] = sample[rand];
            sample[rand] = temp
        }

        return sample.slice(0, n) // 取指定的个数   

    }



    // 返回一个排序后的list拷贝副本。如果传递iteratee参数，iteratee将作为list中每个值的排序依据

    _.sortBy = function (obj, iteratee, context) {
        var index = 0
        iteratee = cb(iteratee, context)

        /**
         * _.map 结果：
         * 将原 obj 的每一个键值包装成一个对象
         * [{value:value,index:index++,criteria},{value:value,index:index++,criteria}]
         * 
         * _.sort 结果：
         * 将 _.map 的结果进行按标准排序
         * [{value:value,index:index++,criteria},{value:value,index:index++,criteria}]
         * 
         * 
         * _.pluck 结果：
         * 将_.sort 中提取出 value 值
         */

        return _.pluck(_.map(obj, function (value, key, list) {
            // 这里返回一个对象是为了按指定函数的标准来排序的结果，为了后面提取每一个 value 值，所以要将 value 包装在这个返回对象中
            return {
                value: value, // 对应 _.pluck 第二个参数 'value'
                index: index++,
                // 产生排序标准
                criteria: iteratee(value, key, list)
            }
        }).sort(function (left, right) {
            var a = left.criteria,
                b = right.criteria

            if (a !== b) { // a,b 不相等时，按标准排序，
                if (a > b || a === void 0) return 1
                if (a < b || b === void 0) return -1
            }
            // 反之
            return left.index - right.index
        }), 'value')
    }



    var group = function (behavior, partition) {
        return function (obj, iteratee, context) {
            var result = partition ? [
                [],
                []
            ] : {};
            iteratee = cb(iteratee, context)

            _.each(obj, function (value, index) {
                var key = iteratee(value, index, obj) // 根据标准来产生集合
                behavior(result, value, key) // 根据产生的键值，来执行指定的函数
            })

            return result
        }
    }


    // 把一个集合分组为多个集合，通过 iterator 返回的结果进行分组. 
    // 如果 iterator 是一个字符串而不是函数, 那么将使用 iterator 作为各元素的属性名来对比进行分组.
    _.groupBy = group(function (result, value, key) {
        if (_.has(result, key)) result[key].push(value);
        else reslut[key] = [value]
    })



    // 给定一个list，和 一个用来返回一个在列表中的每个元素键 的iterator 函数（或属性名）， 返回一个每一项索引的对象
    _.indexBy = group(function (result, value, key) {
        // 这里的 key 是唯一的，，不然会覆盖前一次的值
        result[key] = value
    })




    // 排序一个列表组成一个组，并且返回各组中的对象的数量的计数。
    // 类似groupBy，但是不是返回列表的值，而是返回在该组中值的数目。
    // 根据规则来算出集合中每一个规则对应元素出现的次数
    _.countBy = group(function (result, value, key) {
        if (_.has(result, key)) reslut[key]++;
        else result[key] = 1
    })


    /**
     * [^\ud800-\udfff]：表示不包含代理对代码点的所有字符
     * [\ud800-\udbff][\udc00-\udfff]：表示合法的代理对的所有字符
     * [\ud800-\udfff]：表示代理对的代码点（本身不是合法的Unicode字符）
     */
    //   https://linux.cn/article-3759-1.html?page=1
    var reStrSymbol = /[^\ud800-\udfff]|[\ud800-\udbff][\udc00-\udfff]|[\ud800-\udfff]/g;

    _.toArray = function (obj) {
        if (!obj) return []

        // 如果obj是数组，就返回其副本，避免污染之前的数组
        if (_.isArray(obj)) return slice.call(obj)

        // 这里是有关 Unicode 16 的问题
        // https://zh.wikipedia.org/wiki/UTF-16#UTF-16%E6%8F%8F%E8%BF%B0
        if (_.isString(obj)) {
            return obj.match(reStrSymbol)
        }

        // 如果是类数组，就直接返回其值
        if (isArrayLike(obj)) return _.map(obj, _.identity)

        // 如果是对象，返回他的键值
        return _.values(obj)

    }



    // 返回obj的长度
    _.size = function (obj) {
        if (obj == null) return 0
        // obj 是否为类数组，是就直接返回其length属性，反之，先获取他的所有键值，然后求长度
        // isArrayLike('qwrqwr') -> true
        return isArrayLike(obj) ? obj.length : _.keys(obj).length
    }


    // _.partition(array, predicate) 
    // 拆分一个数组（array）为两个数组：  第一个数组其元素都满足predicate迭代函数， 
    // 而第二个的所有元素均不能满足predicate迭代函数
    _.partition = group(function (result, value, pass) {
        // 将满足指定的函数的元素放在数组的第一个位置，不满足的放在第二个位置
        result[pass ? 0 : 1].push(value)
    }, true)



    // ============================================================
    // 数组的函数集合
    // ============================================================

    _.first = _.head = _.take = function (array, n, guard) {
        // 数组不存在或者为空
        if (array == null || array.length < 1) return void 0;
        // n 不存在或者 guard 为真
        if (n == null || guard) return array[0]
        // 如果指定了 n ，就返回前几个元素组成的数组
        return _.initial(array, array.length - n)
    }

    // 返回数组中除了最后一个元素外的其他全部元素。 在arguments对象上特别有用。
    // 传递 n参数将从结果中排除从最后一个开始的n个元素
    // 注：逻辑或优先级大于三目
    _.initial = function (array, n, guard) {
        return slice.call(array, 0, Math.max(0, array.length - (n == null || guard ? 1 : n)))
    }


    // 返回array（数组）的最后一个元素。
    // 传递 n参数将返回数组中从最后一个元素开始的n个元素
    _.last = function (array, n, guard) {
        if (array == null || array.length < 1) return void 0;
        // 默认返回最后一个元素
        if (n == null || guard) return array[array.length - 1];
        return _.rest(array, Math.max(0, array.length - n));
    }

    // 默认返回数组中除了第一个元素外的其他全部元素。
    // 传递 index 参数将返回从index开始的剩余所有元素
    _.rest = _.tail = _.drop = function (array, n, guard) {
        return slice.call(array, n == null || guard ? 1 : n)
    }


    // 去除所有为 false 的值
    _.compact = function (array) {
        return _.filter(array, Boolean)
    }


    // 内部的递归扁平函数
    // _.flatten([1, [2], [3, [[4]]]])  ->[1, 2, 3, 4]
    // 如果shallow = true，数组将只减少一维的嵌套
    // _.flatten([1, [2], [3, [[4]]]])  ->[1, 2, 3, [[4]]]

    var flatten = function (input, shallow, strict, output) {
        output = output || []
        var idx = output.length

        for (var i = 0, length = getLength(input); i < length; i++) {
            var value = input[i]
            // value 是数组或者类数组
            if (isArrayLike(value) && (_.isArray(value) || _.isArguments(value))) {
                if (shallow) {
                    // 只减少一层的嵌套
                    var j = 0,
                        len = value.length
                    while (j < len) output[idx++] = value[j++]
                } else {
                    // 递归将本次循环里的元素进行递归展开
                    flatten(value, shallow, strict, output)
                    // 获取本轮递归结束猴儿输出数组的长度
                    idx = output.length
                }
            } else if (!strict) {
                /**
                 * 当最后的value 值不是数组，而是基本类型，
                 * 如果strict 为 true ，且 shallow  为false 时，flatten 并没有相应的处理逻辑，所以返回空数组
                 */
                // 直接添加到数组中
                output[idx++] = value
            }
        }
        return output
    }


    _.flatten = function (array, shallow) {
        return flatten(array, shallow, true)
    }


    // _.without(array, *values) 
    // 返回一个删除所有values值后的 array副本
    _.without = restArgs(function (array, otherArrays) {
        return _.difference(array, otherArrays)
    })



    // 数组去重
    // 如果已知数组有序，则可以使用一个更快的算法
    // 如果有第三个参数，就对数组的每个元素进行迭代，然后结果去重
    _.uniq = _.unique = function (array, isSorted, iteratee, context) {
        //  如果isSorted 不是布尔值，也就是作如下调用
        // _.uniq(array,iteratee,context)，类似redux 的 createStore
        // 就等价于 _.uniq (array, false, iteratee, context)
        if (!_.isBoolean(isSorted)) {
            context = iteratee;
            iteratee = isSorted;
            isSorted = false
        }

        // 如果有迭代函数，绑定this
        if (iteratee != null) iteratee = cb(iteratee, context)

        var result = [], // 最终的结果数组
            seen = [] //暂存已经去重的元素或者经过迭代函数后的结果

        for (var i = 0, length = getLength(array); i < length; i++) {
            var value = array[i],
                //  iteratee 是否为null
                computed = iteratee ? iteratee(value, i, array) : value;
            if (isSorted && !iteratee) { // isSorted 存在，并且iteratee 为 null
                // 此时，computed 是 value 值
                // 如果 i === 0 就直接push 到结果数组中，
                // 从第二个元素开始，每个元素只需要和前面的元素进行简单对比，如果不同，就直接push
                if (!i || seen !== computed) result.push(value);
                seen = computed // 保存当前的value 值，便于下一次的比较
            } else if (iteratee) { // 如果有迭代函数
                if (!_.contains(seen, computed)) { // seen 里面不包含当前的元素经过迭代后的结果
                    seen.push(computed); // 将该结果直接放入 seen
                    result.push(value) // 同时将改原始值 value 直接放入结果数组中
                }
            } else if (!_.contains(result, value)) { // 若 isSorted 是 false 即无序，且不存在迭代函数  _.uniq (array)
                // 如果result 里面没有该值，直接push 
                /**
                 * var a = [{c: 1}, {b: 2}, {c: 1}];
                 * console.log(_.uniq(a))       // [{c: 1}, {b: 2}, {c: 1}]
                 */
                result.push(value)
            }
        }

        return result
    }

    // 返回传入的 arrays（数组）并集：按顺序返回，返回数组的元素是唯一的，可以传入一个或多个 arrays（数组
    // _.union([1, 2, 3], [101, 2, 1, 10], [2, 1]);
    // 经过restArgs后，arrays 为 [[1, 2, 3], [101, 2, 1, 10], [2, 1]]
    _.union = restArgs(function (arrays) {
        // flatten 值减少一层的嵌套 ->[1, 2, 3, 101, 2, 1, 10, 2, 1]
        // _.uniq之后 -> [1, 2, 3, 101, 10]

        // 注：由于 flatten 只展开一层，所以，传给union 的参数arrays 最好形如([1, 2, 3], [101, 2, 1, 10], [2, 1]) ，([1, 2, 3], [101, [2, 1], 10], [2, 1])则无效
        return _.uniq(flatten(arrays, true, true))
    })


    // 返回传入 arrays（数组）交集。结果中的每个值是存在于传入的每个arrays（数组）里。
    // _.intersection([1, 2, 3], [101, 2, 1, 10], [2, 1]);  ->  [1,2]
    _.intersection = function (array) {
        var result = []
        var argsLength = arguments.length;
        for (var i = 0, length = getLength(array); i < length; i++) {
            var item = array[i]
            // 如果结果数组中已包含该 item ，就通过本次循环
            if (_.contains(result, item)) continue;

            var j;
            for (j = 1; j < argsLength; j++) { // 从函数的第二个参数开始比较
                if (!_.contains(arguments[j], item)) break;
            }

            // 说明，遍历了全部数组，且第一个数组中的本次循环元素，存在于每个数组
            if (j === argsLength) result.push(item)
        }

        return result
    }


    // 类似于without，但返回的值来自array参数数组，并且不存在于other 数组.
    _.difference = restArgs(function (array, rest) {
        // 先展开成一维的
        rest = flatten(rest, true, true);
        return _.filter(array, function (value) { // 遍历第一个数组，
            return !_.contains(rest, value) // 如果rest 中存在此次遍历的元素，就丢弃
        })
    })


    // [["moe", 30, true], ["larry", 40, false], ["curly", 50, false]]
    // —— > [['moe', 'larry', 'curly'], [30, 40, 50], [true, false, false]]
    _.unzip = function (array) {
        var length = array && _.max(array, getLength).length || 0 // 取 array 里的数组的最大长度
        var result = Array(length)

        for (var index = 0; index < length; index++) {
            result[index] = _.pluck(array, index) // _.pluck 取数组中每个子数组对应位置的元素
        }

        return result
    }

    // 将 每个arrays中相应位置的值合并在一起。在合并分开保存的数据时很有用
    // _.zip(['moe', 'larry', 'curly'], [30, 40, 50], [true, false, false])
    // 经过restArgs后，_.unzip 的参数为 [['moe', 'larry', 'curly'], [30, 40, 50], [true, false, false]]
    // ——— >[["moe", 30, true], ["larry", 40, false], ["curly", 50, false]]
    // 注：感觉_.zip和_.unzip 基本一致，没必要分开
    _.zip = restArgs(_.unzip);




    // 数组转为对象。传递任何一个单独[key, value]对的列表，或者一个键的列表和一个值得列表。 
    // 如果存在重复键，最后一个值将被返回
    _.object = function (list, values) {
        var result = {}
        for (var i = 0, length = getLength(list); i < length; i++) {
            if (values) {
                // _.object(['moe', 'larry', 'curly'], [30, 40, 50]); -> {moe: 30, larry: 40, curly: 50}
                result[list[i]] = values[i]
            } else {
                // _.object([['moe', 30], ['larry', 40], ['curly', 50]]); -> {moe: 30, larry: 40, curly: 50}
                result[list[i][0]] = list[i][1]
            }
        }
        return result
    }


    // _.find辅助函数，找到索引值
    var createPredicateIndexFinder = function (dir) {
        return function (array, predicate, context) {
            predicate = cb(predicate, context);
            var length = getLength(array);
            var index = dir > 0 ? 0 : length - 1;

            for (; index >= 0 && index < length; index += dir) {
                if (predicate(array[index], index, array)) return index
            }

            return -1;
        }
    }

    // 从前向后找到索引值
    _.findIndex = createPredicateIndexFinder(1);
    // 从后向前找到索引值
    _.findLastIndex = createPredicateIndexFinder(-1)


    // 使用二分法查找元素在数组中的位置
    _.sortedIndex = function (array, obj, iteratee, context) {
        iteratee = cb(iteratee, context, 1);

        var value = iteratee(obj);
        var low = 0,
            high = getLength(array);
        while (low < hight) {
            var mid = Math.floor((low + high) / 2)
            if (iteratee(array[mid]) < value) low = mid + 1;
            else high = mid
        }

        return low
    }




    // 找到value在 array 中的索引值，找不到返回 -1
    var createIndexFinder = function (dir, predicateFind, sortedIndex) {
        // 同样在外面包一层表示从前向后找还是从后向前找，与上面的 createPredicateIndexFinder一样

        /**
         * idx 可以是数字，表示从该位置开始查找，
         * 也可以是布尔值，在数组有序的情况下，这样就能用二分查找法加快查找
         */
        return function (array, item, idx) {
            var i = 0,
                length = getLength(array)

            if (typeof idx == 'number') { // idx 如果是 number ，就只能遍历查找
                if (dir > 0) { // 左到右查找
                    // 如果idx 是正，则直接取该值，反之取length - |idx|，这里使用Math.Max是防止 idx 为负数，且比数组的长度大，这时就将i 置为0
                    i = idx >= 0 ? idx : Math.max(idx + length, i)
                } else { // 右到左查找
                    // 如上
                    length = idx >= 0 ? Math.min(idx + 1, length) : idx + length + 1
                }
            } else if (sortedIndex && idx && length) { // 数组有序
                idx = sortedIndex(array, item);
                return array[idx] === item ? idx : -1
            }


            // 特别处理 NaN的情况
            if (item !== item) {
                // 直接用数组的slice方法，截取数组从 i到length，并用 _.isNaN来判断是否存在 NaN
                idx = predicateFind(slice.call(array, i, length), _.isNaN);
                return idx >= 0 ? idx + i : -1;
            }

            // 循环遍历数组，找到是否有与之相等的值，并返回 索引值
            for (idx = dir > 0 ? i : length - 1; idx >= 0 && idx < length; idx += dir) {
                if (array[idx] === item) return idx
            }

            // 找不到，返回 -1
            return -1
        }
    }

    _.indexOf = createIndexFinder(1, _.findIndex, _.sortedIndex)
    _.lastIndexOf = createIndexFinder(-1, _.findLastIndex)



    // _.range(10) =>[0,1,2,3,4,5,6,7,8,9,]   -> 此时，默认 step = 1
    // _.range(1,11) => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    // _.range(0, 30, 5) => [0, 5, 10, 15, 20, 25]
    // 类似于希尔排序的步长，从一组数字中找出相隔一个 步长的数字
    _.range = function (start, stop, step) {
        if (stop == null) {
            stop = start || 0;
            start = 0;
        }

        if (!step) {
            step = stop < start ? -1 : 1
        }


        // 由这组数组的开始和结尾的差值来确定在这个步长的条件下，
        // 结果数组中有多少个数
        var length = Math.max(Math.ceil((stop - start) / step), 0)
        var range = Array.length


        for (var idx = 0; idx < length; idx++, start += step) { // 加上步长
            range[idx] = start
        }

        return range
    }


    // 将数组中的元素按照指定的子数组的大小进行分块
    _.chunk = function (array, count) {
        if (count == null || count < 1) return []

        var result = []
        var i = 0,
            length = array.length
        while (i < length) {
            result.push(slice.call(array, i, i += count))
        }

        return result
    }







    // =====================================================
    // 函数部分
    // =====================================================







    // 决定一个函数是作为构造函数还是接受参数的普通函数
    var executeBound = function (sourceFunc, boundFunc, context, callingContext, args) {
        // 这里的和上文的 this instanceof fNOP == false 一样
        if (!(callingContext instanceof boundFunc)) return sourceFunc.apply(context, args)

        // 下面的几步骤，基本和 new 一个构造函数的过程一样，详见如下：
        // https://github.com/jyzwf/blog/issues/27
        // 获取继承sourceFun原型的一个对象
        var self = baseCreate(sourceFunc.prototype) // 类似上文的 fNOP 
        // 执行构造函数，并将里面的 this 指向 self ,返回结果
        var result = sourceFunc.apply(self, args)
        // 如果 返回的结果是一个对象，就直接返回该对象
        if (_.isObject(result)) return result
        // 否则返回之前 new 出来的对象
        return self

    }


    // 具体见 bind 详解 
    // https://github.com/jyzwf/blog/issues/36
    _.bind = restArgs(function (func, context, args) {
        /** 
         * startIndex = 2
         * 返回如下函数 
         * function () {
            var length = Math.max(arguments.length - startIndex, 0), // 防止startIndex 过大
                rest = Array(length),
                index = 0;

            for (; index < length; index++) { // 将从startIndex开始的后面参数放入数组
                rest[index] = arguments[index + startIndex] // 从args 开始收集参数
            }

            
            switch (startIndex) {
                case 0:
                    return func.call(this, rest);
                case 1:
                    return func.call(this, arguments[0], rest);

                    // 在_.invoke()使用
                case 2: // 调用这个 case
                    return func.call(this, arguments[0], arguments[1], rest);
            }


        }
        */
        if (!_.isFunction(func)) throw new TypeError('Bind must be called on a function')
        var bound = restArgs(function (callArgs) { // 收集剩余函数
            /** 
             * startIndex = 0
             * 
             * function () {
            var length = Math.max(arguments.length - startIndex, 0), // 防止startIndex 过大
                rest = Array(length),
                index = 0;

            for (; index < length; index++) { // 将从startIndex开始的后面参数放入数组
                rest[index] = arguments[index + startIndex] // 从args 开始收集参数
            }

           
            switch (startIndex) {
                case 0:  // 调用这个 case
                    return func.call(this, rest);
                case 1:
                    return func.call(this, arguments[0], rest);

                    // 在_.invoke()使用
                case 2: 
                    return func.call(this, arguments[0], arguments[1], rest);
            }

        }
             */
            return executeBound(func, bound, context, this, args.concat(callArgs))
        })

        return bound
    })


    // 类似_.bind()，也是先传一部分参数，如果需要后面传参数，就先用 "_" 占位，后面再用 参数去替换第一步的 "_" 占位符
    /**
     * _.partial = function () {
            var length = Math.max(arguments.length - startIndex, 0), // 防止startIndex 过大
                rest = Array(length),
                index = 0;

            for (; index < length; index++) { // 将从startIndex开始的后面参数放入数组
                rest[index] = arguments[index + startIndex]
            }

            switch (startIndex) {
                case 0:
                    return func.call(this, rest);
                case 1:  // 调用这个函数
                    return func.call(this, arguments[0], rest);
                    // 在_.invoke()使用
                case 2:
                    return func.call(this, arguments[0], arguments[1], rest);
            }
        }
     */
    _.partial = restArgs(function (func, boundArgs) {

        var placeholder = _.partial.placeholder;

        var bound = function () {
            var position = 0,
                length = boundArgs.lngth; // 当前参数总长度，包括 占位参数
            var args = Array(length)
            for (var i = 0; i < length; i++) {
                args[i] = boundArgs[i] === placeholder ? arguments[position++] : boundArgs[i]
            }

            while (position < arguments.length) args.push(arguments[position++]); // 如果后续参数多与第一步的占位，就直接将后续的参数添加到总参数中
            return executeBound(func, bound, this, this, args); // 类似 _.bind ，绑定上下文，
        }

        return bound
    })

    _.partial.placeholder = _;


    // 将一系列的方法的this 指向 obj
    // _.bindAll(object, *methodNames) 
    // http://www.bootcss.com/p/underscore/#bindAll
    _.bindAll = restArgs(function (obj, keys) {
        keys = flatten(keys, false, false) // 将keys 展开为一维的
        var index = keys.length

        // 如果没有传入参数即没有 methodNames 报错
        if (index < 1) throw new Error('bindAll must be passed function names')
        while (index--) { // 依次按照给的的方法，在obj 中逐个绑定 this
            var key = keys[index]
            obj[key] = _.bind(obj[key], obj)
        }
    })


    // 缓存某函数的计算结果，提高效率
    /** 
     * var fibonacci = _.memoize(function(n) {
            return n < 2 ? n: fibonacci(n - 1) + fibonacci(n - 2);
        });

        fibonacci = memoize
     */
    _.memoize = function (func, hasher) {
        var memoize = function (key) {
            var cache = memoize.cache
            // 如果 hasher 函数存在，就用该函数来结合后面传进来的函数计算缓存的 key 值，否则 默认为 后面函数的第一个参数
            var address = "" + (hasher ? hasher.apply(this, arguments) : key)
            if (!_.has(cache, address)) cache[address] = func.apply(this, arguments)
            return cache[address]
        }


        memoize.cache = {}
        return memoize
    }


    // 延迟执行
    _.delay = restArgs(function (func, wait, args) {
        return setTimeout(function () {
            return func.apply(null, args)
        }, wait)
    })



    _.defer = _.partial(_.delay, _, 1)

    /** 
     * 这一部分参考了https://github.com/hanzichi/underscore-analysis/issues/22
     * 这里如设置了 leading === false 那么这个函数一开始就不会执行，一直延迟到 wait 时间后再执行
     *  1. 立马执行和延迟执行
     *  2. 只有立马执行 ->trailing === false 
     *  3. 只有延迟执行 -> leading === false 
     */
    _.throttle = function (func, wait, options) {
        var timeout, context, args, result;
        var previous = 0; // 上一次执行回调的时间戳  
        if (!options) options = {};

        var later = function () {
            // 如果 options.leading === false
            // 则每次触发回调后将 previous 置为 0，确保 下一次执行的时候，依旧延迟 wait 时间
            previous = options.leading === false ? 0 : _.now();
            timeout = null;
            result = func.apply(context, args);
            // 防止 func 里面对 timeout 的修改
            if (!timeout) context = args = null;
        };

        var throttled = function () {
            // 记录当前的时间戳
            var now = _.now();
            // 第一次调用，此时，previous 为0，如果 leading 为 false，就将previous 置为 now ，
            // 表示上一次已经执行过了
            if (!previous && options.leading === false) previous = now;
            var remaining = wait - (now - previous);
            context = this;
            args = arguments;
            //  <=0 表示过了指定的 wait 时间，立马执行
            // remaining > wait，表示客户端系统时间被调整过
            if (remaining <= 0 || remaining > wait) {
                if (timeout) { // 解除引用
                    clearTimeout(timeout);
                    timeout = null;
                }
                // 重置时间戳
                previous = now;
                // 并执行函数
                result = func.apply(context, args);
                if (!timeout) context = args = null;
            } else if (!timeout && options.trailing !== false) {
                // trailing === false 时，这时候，如果window.onscroll 时，只会立马执行一次函数，而不会再有延迟执行
                // 在wait 时间间隔里面，如果定时器已经存在，不管你怎么在调用这个函数，仍为上一次的值 并且 trailing !== false
                timeout = setTimeout(later, remaining);
            }
            return result;
        };

        throttled.cancel = function () {
            clearTimeout(timeout);
            previous = 0;
            timeout = context = args = null;
        };

        return throttled;
    };



    // 
    _.debounce = function (func, wait, immediate) {
        var timeout, result;

        // wait 间隔之后执行的函数
        var later = function (context, args) {
            timeout = null;
            // 这里通过设置 args 是否存在来阻止 func 的再次执行，当 immediate 是真的时候，
            if (args) result = func.apply(context, args);
        };

        var debounced = restArgs(function (args) {
            // 如果再次调用，就重置之前的前面的时间
            if (timeout) clearTimeout(timeout);
            if (immediate) {
                // 如果立即触发，则需要 定时器没有设置
                // 这里注意，timeout 第一次是 null 后面会变成定时器Id ,
                // 以 window.onscroll = _.debounce(log, 1000,true); 为例
                // 就是说 func 在此次快速滚动中只会执行一次，后面的不停滚动， timeout 为定时器的 id , 因而 callNow 为 false ,不在执行，直到此次滚动停下后，并且执行定时器函数
                var callNow = !timeout;
                // 这里虽然又设置了 timeout ，但是在later 中会置为 null ，如果不置为 null ,那么在后面的执行中，不会再执行函数, 并且由于未给 later 传参数，所以 func 不会执行
                timeout = setTimeout(later, wait);
                if (callNow) result = func.apply(this, args);
            } else {
                timeout = _.delay(later, wait, this, args);
            }

            return result;
        });

        debounced.cancel = function () {
            clearTimeout(timeout);
            timeout = null;
        };

        return debounced;
    };



    /**
     * var hello = function(name) { return "hello: " + name; };
            hello = _.wrap(hello, function(func) {
            return "before, " + func("moe") + ", after";
        });
        hello();
        => 'before, hello: moe, after'

    _.wrap(hello, function(func) {
            return "before, " + func("moe") + ", after";
        });
        => 下面的 bound 函数
    
     */
    _.wrap = function (func, wrapper) {
        // _.partial() 执行的函数为：
        // 
        /* function (func, boundArgs) {
            // func -> wrapper    boundArgs ->func
            var placeholder = _.partial.placeholder;
    
            var bound = function () {
                var position = 0,
                    length = boundArgs.lngth; // 当前参数总长度，包括 占位参数
                var args = Array(length)
                for (var i = 0; i < length; i++) {
                    args[i] = boundArgs[i] === placeholder ? arguments[position++] : boundArgs[i]
                }
    
                while (position < arguments.length) args.push(arguments[position++]); // 如果后续参数多与第一步的占位，就直接将后续的参数添加到总参数中
                // if (!(callingContext instanceof boundFunc)) return sourceFunc.apply(context, args); 这里
                // var result = sourceFunc.apply(self, args);
                // 以上两部分的 sourceFunc 都为 wrapper ,然后 args 的第一个元素 就是 func ，这样就把func 作为 第一个参数，传入了wrapper
                return executeBound(func, bound, this, this, args); // 类似 _.bind ，绑定上下文，
            }
    
            return bound
        } */

        // 然后返回 bound
        return _.partial(wrapper, func)
    }

    // 将结果去反
    _.negate = function (predicate) {
        return function () {
            return !predicate.apply(this, arguments);
        };
    };


    // 返回函数集 functions 组合后的复合函数, 
    // 也就是一个函数执行完之后把返回的结果再作为参数赋给下一个函数来执行. 
    // 以此类推. 在数学里, 把函数 f(), g(), 和 h() 组合起来可以得到复合函数 f(g(h()))。
    // 类似 _.reduce ，只不过此方法将结果从后面向前传递，_.reduce 从前向后传递，此方法在 redux 里面的compose 一致
    _.compose = function () {
        var args = arguments
        var strat = args.length - 1
        return function () {
            var i = start
            var result = args[start].apply(this, arguments)
            while (i--) result = args[i].call(this, result)
            return result
        }
    }


    // 创建一个函数, 只有在运行了 count 次之后才有效果
    // 在处理同组异步请求返回结果时, 如果你要确保
    // 同组里所有异步请求完成之后才 执行这个函数, 这将非常有用
    _.after = function (times, func) {
        return function () {
            if (--time < 1) {
                return func.apply(this, arguments)
            }
        }
    }


    // 调用次数不超过指定次数
    // 最后一个函数调用的结果 是被记住并返回 。
    _.before = function (times, func) {
        var memo;
        return function () {
            if (--times > 0) { // 如果times = 1 了，那么 --times 就是0  这里也就不会再执行
                memo = func.apply(this, arguments);
            }

            // 第 times 次的结果与第 times - 1 次结果一样
            if (times <= 1) func = null; // 有点多余
            return memo;
        };
    };


    // 之执行一次函数
    _.once = _.partial(_.before, 2);


    _.restArgs = restArgs;







    // ========================================================
    // 以下是对象的一些方法
    // ========================================================








    // 由于在ie 版本小于9 以下 不能使用 for... in ..来取出所有属性值
    // 如果重写了对象的 toString 方法，这个 key 就不能在 IE<9 下 用 for... in 枚举

    var hasEnumBug = !{
        toString: null
    }.propertyIsEnumerable('toString') // ie<9时 { toString: null }.propertyIsEnumerable('toString') 返回false
    var nonEnumerableProps = ['valueOf', 'isPrototypeOf', 'toString',
        'propertyIsEnumerable', 'hasOwnProperty', 'toLocaleString'
    ]; // 不能用for... in 遍历的 key 集合


    var collectNonEnumProps = function (obj, keys) {
        var nonEnumIdx = nonEnumerableProps.length;
        var constructor = obj.constructor;
        // 对象的原型如果被重写，则 proto 为 Object.prototype
        // 反之，则为 obj.constructor.prototype
        /*  var a = {
             constructor: function () { }
         }
 
         此时：constructor = function () { } */

        var proto = _.isFunction(constructor) && constructor.prototype || ObjProto


        // 如果obj 有 constructor 这个key 
        // 并且没有存在数组中，就存入数组
        var prop = 'constructor'
        if (_.has(obj, prop) && !_.contains(keys, prop)) keys.push(prop)


        while (nonEnumIdx--) {
            prop = nonEnumerableProps[nonEnumIdx]
            // prop 在对象里面，并且与Object原型上的不是同一个引用，且不包含在keys 中
            if (prop in obj && obj[prop] !== proto[prop] && !_.contains(keys, prop)) {
                keys.push(prop)
            }
        }
    }


    // 获取object对象所有的属性名称。
    // 不包括原型上的属性
    _.keys = function (obj) {
        if (!_.isObject(obj)) return [];
        if (nativeKeys) return nativeKeys(obj);
        var keys = [];
        for (var key in obj)

            if (_.has(obj, key)) keys.push(key);
        // Ahem, IE < 9.
        if (hasEnumBug) collectNonEnumProps(obj, keys);
        return keys;
    };



    // 取出对象的所有属性名，可枚举，包括原型上的属性
    _.allKeys = function (obj) {
        if (!_.isObject(obj)) return [] // 不是对象，直接返回空数组
        var keys = []
        for (var key in obj) keys.push(key)

        // 处理 ie < 9 以下的情况
        if (hasEnumBug) collectNonEnumProps(obj, keys)
        return keys
    }


    // 返回object对象所有的属性值
    _.values = function (obj) {
        var keys = _.keys(obj);
        var length = keys.length;
        var values = Array(length)

        for (var i = 0; i < length; i++) {
            values[i] = obj[keys[i]]
        }

        return values
    }


    // 对对象的每一个键值对执行指定函数，并保存结果
    _.mapObject = function (obj, iteratee, context) {
        // 绑定上下文
        iteratee = cb(iteratee, context)
        var keys = _.keys(obj),
            length = keys.length,
            result = {}

        for (var index = 0; index < length; index++) {
            var currentKey = keys[index];

            results[currentKey] = iteratee(obj[currentKey], currentKey, obj);
        }
        return results;
    }


    // 将对象的键值对转换成数组的形式
    // obj = {a:666,b:2333}
    // -> [['a','666'],['b','2333']]
    _.pairs = function (obj) {
        var keys = _.keys(obj),
            length = keys.length,
            pairs = Array(length)

        for (var i = 0; i < length; i++) {
            pairs[i] = [keys[i], obj[keys[i]]]
        }

        return pairs
    }


    // 将对象的键值对反转
    // obj = {a:666,b:2333}
    // -> result={666:'a','2333':'b'}
    _.invert = function (obj) {
        var result = {};
        var keys = _.keys(obj);
        for (var i = 0, length = keys.length; i < length; i++) {
            result[obj[keys[i]]] = keys[i];
        }
        return result;
    };

    // 返回一个对象里所有的方法名, 而且是已经排序的 — 也就是说, 对象里每个方法(属性值是一个函数)的名称.
    _.functions = _.methods = function (obj) {
        var names = [];
        for (var key in obj) {
            if (_.isFunction(obj[key])) names.push(key);
        }
        return names.sort();
    };

    // 创建一个分配器函数，供内部使用
    var createAssigner = function (keysFunc, defaults) {
        return function (obj) {


            var length = arguments.length

            if (defaults) obj = Object(obj);

            // 如果只有一个参数或者一个也没有
            if (length < 2 || obj == null) return obj
            for (var index = 1; index < length; index++) { // 从1开始
                var source = arguments[index],
                    keys = keysFunc(source), // 获取obj 的所有可枚举属性
                    l = keys.length;

                for (var i = 0; i < l; i++) {
                    var key = keys[i];
                    // 这里的default 为了 _.extend 和 _.extendOwn 准备，第一个对象有的属性会被后面的对象覆盖
                    // 而后面的obj[key] === void 0 则为 _.defaults 准备，后面的不覆盖前面的
                    if (!defaults || obj[key] === void 0) obj[key] = source[key]
                }
            }

            return obj
        }
    }


    // _.extend(destination, *sources) 
    // 复制source对象中的所有属性覆盖到destination对象上，并且返回 destination 对象.
    // 复制是按顺序的, 所以后面的对象属性会把前面的对象属性覆盖掉(如果有重复).
    _.extend = createAssigner(_.allKeys);

    _.extendOwn = createAssigner(_.keys)

    _.findKey = function (obj, predicate, context) {
        predicate = cb(predicate, context);
        var keys = _.keys(obj),
            key;
        for (var i = 0, length = keys.length; i < length; i++) {
            key = keys[i];
            if (predicate(obj[key], key, obj)) return key;
        }
    }


    var keyInObj = function (value, key, obj) {
        return key in obj
    }


    // 在obj中找到 keys 中指定的属性键值，或者接受一个判断函数，指定挑选哪个key。
    _.pick = restArgs(function (obj, keys) {
        var result = {},
            iteratee = keys[0] // 获取keys 中的第一个元素
        if (obj == null) return result
        // 判断iteratee 是否是函数，是就执行函数的标准来筛选
        if (_.isFunction(iteratee)) {
            // 如果keys 长度大于 1 ,指定了上下文
            if (keys.length > 1) iteratee = optimizeCb(iteratee, keys[1])
            // 获取对象所有的 key 
            keys = _.allKeys(obj)
        } else {
            // 没有指定 函数，赋值为上面的判断键值是否在一个对象里面的函数
            iteratee = keyInObj
            // 将要判断的键值全部展开为一维
            keys = flatten(keys, false, false)
            obj = Object(obj)
        }

        for (var i = 0, length = keys.length; i < length; i++) {
            var key = keys[i]
            var value = obj[key]
            // 这里要注意区别keys 对应 iteratee 的不同情形有着不同的值
            if (iteratee(value, key, obj)) result[key] = value // 如果为真，就将结果保留
        }

        return result
    })


    //  与上面相反，在obj 中去除 keys 里面包含的属性
    _.omit = restArgs(function (obj, keys) {
        var iteratee = keys[0],
            context;
        if (_.isFunction(iteratee)) {
            // 获取去反函数
            // 6666666666666666666666666666666666666
            iteratee = _.negate(iteratee);
            if (keys.length > 1) context = keys[1];
        } else {
            // 将所有的属性值 字符串化
            keys = _.map(flatten(keys, false, false), String);
            iteratee = function (value, key) {
                // keys 里面是否包含 obj 里面的这个key 
                // 如果包含，取反
                return !_.contains(keys, key);
            };
        }
        return _.pick(obj, iteratee, context);
    });



    /** 
     * var iceCream = {flavor: "chocolate"};
        _.defaults(iceCream, {flavor: "vanilla", sprinkles: "lots"});
        => {flavor: "chocolate", sprinkles: "lots"}

     * _.defaults = function (obj) {
        // default = true
        // keysFunc = _.allKeys

            var length = arguments.length

            if (defaults) obj = Object(obj);

            // 如果只有一个参数或者一个也没有
            if (length < 2 || obj == null) return obj
            for (var index = 1; index < length; index++) { // 从1开始
                var source = arguments[index],
                    keys = keysFunc(source), // 获取obj 的所有可枚举属性
                    l = keys.length;

                for (var i = 0; i < l; i++) {
                    var key = keys[i];
                    if (!defaults || obj[key] === void 0) obj[key] = source[key]
                }
            }

            return obj
        }
     */
    _.defaults = createAssigner(_.allKeys, true);


    _.create = function (prototype, props) {
        // result 是一个对象，result.__proto__  = prototype
        var result = baseCreate(prototype)
        // 如果有props ,则后者覆盖前面的
        if (props) _.extendOwn(result, props)
        return result
    }


    _.clone = function (obj) {
        if (!_.isObject(obj)) return obj;
        // 先判断obj 是否是数组，是就直接用 slice 方法返回新数组，否则就使用 _.extend 复制
        return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
    }


    // 用 object作为参数来调用函数interceptor， 然后返回object。 
    // 这种方法的主要意图是作为函数链式调用 的一环, 为了对此对象执行操作并返回对象本身
    _.tap = function (obj, interceptor) {
        interceptor(obj);
        return obj;
    }


    // 判断object 里面是否有给定的键值对
    _.isMatch = function (object, attrs) {
        var keys = _.keys(attrs),
            length = keys.length;

        if (object == null) return !length

        var obj = Object(object); // 为啥要这一步？？？？？？？？？？？？？？？？？？？？？？？？？？？？

        for (var i = 0; i < length; i++) {
            var key = keys[i]
            // 两者不等，或者 key 不在 obj 中，就返回false
            if (attrs[key] !== object[key] || !(key in obj)) return false
        }

        return true
    }


    var eq, deepEq

    eq = function (a, b, aStack, bStack) {
        // 因为 0=== -0 
        // 所以，先判断 a !== 0 保证了，a和b 是不为0 的，
        // 其次，判断，a 和b 与 0 和 -0 的关系 
        // 1/0 == Infinite
        // 1/-0 == -Infinite
        if (a === b) return a !== 0 || 1 / a === 1 / b


        // a和b 中只要有一个是 undefined 或者 null ,就判为 false ,严格模式下
        if (a == null || b == null) return false;

        // NaN 情况
        // 如果 a 是NaN ，则判断 b 是不是 NaN
        if (a !== a) return b !== b

        var type = typeof a
        // 经过上面的if 语句，如果是基本类型，如果相等，那么前面就已经有了结论，不会跳到这里，
        // 这里是排除 基本数据类型的判断，凡是数据基本类型，到了这一步，表明两者并不相等
        // 以便下面的对象的深度比较
        if (type !== 'function' && type !== 'object' && typeof b != 'object') return false;

        // 接下来进行对象的深度比较
        return deepEq(a, b, aStack, bStack);

    }


    deepEq = function (a, b, aStack, bStack) {
        // 如果 a,b 是underscore 的子类，
        // 那么就比较 _wrapped 属性值
        // 也就是传进来的 obj
        if (a instanceof _) a = a._wrapped;
        if (b instanceof _) b = b._wrapped;

        var className = toString.call(a)
        // 先用Object.prototype.toString 方法判断是否属于同一类型
        if (className !== toString.call(b)) return false

        // 下面针对不同的情况进行讨论
        switch (className) {
            case '[object RegExp]':
            case '[object String]':
                // new String
                // 正则和字符串的则转换为字符串来比较
                return '' + a === '' + b;

            case '[object Number]':
                // 如果+a !== +a 那么a = NaN
                // 此时判断 b 是否是 NaN
                if (+a !== +a) return +b !== +b;
                // 将 a 转换为  基本类型
                // 如果 a 为 0，判断 1 / +a === 1 / b
                // 否则判断 +a === +b
                return +a === 0 ? 1 / +a === 1 / b : +a === +b;


                // 直接将 Date 和 Boolean  转化为 数字比较
            case '[object Date]':
            case '[object Boolean]':
                return +a === +b;

                /** 
                 * var a = Symbol(1)
                    var b  = Symbol(1)
                    a === b  -> false

                    所以此时比较 时应该就比较 传入 Symbol 的参数

                    var a = Symbol(1)
                    var b  = Symbol(1)      
                    Symbol.prototype.valueOf.call(b) === Symbol.prototype.valueOf.call(a)  // false
                    Symbol.prototype.toString.call(b) === Symbol.prototype.toString.call(a) // true

                    // 这里好像判断失误了？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？？
                 */
            case '[object Symbol]':
                return SymbolProto.valueOf.call(a) === SymbolProto.valueOf.call(b);
        }

        // 判断是否是数组
        var areArrays = className === '[object Array]';
        if (!areArrays) { // 如果不是数组
            // 此时 typeof a| b 是函数。。这样两个函数不管如何直接 false
            if (typeof a != 'object' || typeof b != 'object') return false;

            // Objects with different constructors are not equivalent, but `Object`s or `Array`s
            // from different frames are.
            // 如果 a 和 b 有着不同的构造函数不一定是不等，如 Object 和 Array 如果在不同的 iframes 的时候
            var aCtor = a.constructor,
                bCtor = b.constructor;
            // aCtor !== bCtor 说明 两者的构造函数不同
            // _.isFunction(aCtor) 保证 能使用 instanceof 来进行判断
            // ('constructor' in a && 'constructor' in b) 是防止如下情况：
            /* var attrs = Object.create(null);
            attrs.name = "Bob";
            eq(attrs, {
                name: "Bob"
            }); 
            // 这两个对象应该是相等的
            */
            if (aCtor !== bCtor && !(_.isFunction(aCtor) && aCtor instanceof aCtor &&
                    _.isFunction(bCtor) && bCtor instanceof bCtor) &&
                ('constructor' in a && 'constructor' in b)) {
                return false;
            }
        }


        aStack = aStack || [];
        bStack = bStack || [];

        var length = aStack.length;
        while (length--) { // 逐个比较其值    第一次时 length = 0 这里不会执行
            if (aStack[length] === a) return bStack[length] === b
        }

        aStack.push(a)
        bStack.push(b)

        if (areArrays) { // 如果是数组
            length = a.length
            if (length !== b.length) return false // 数组长度不等，自然两者不相等

            while (length--) { // 递归比较a和b 的一个个子元素，层层剥茧,只要有一个不同，就是false
                if (!eq(a[length], b[length], aStack, bStack)) return false
            }
        } else { // 是纯对象情况
            var keys = _.keys(a),
                key // 获取a 的所有 键
            length = keys.length
            // 键值长度不等，自然不等
            if (_.keys(b).length !== length) return false;
            while (length--) {
                // Deep compare each member
                key = keys[length];
                // 先看 b 中是否有这个键，有的话，再将a 和 b 对应这个键的键值进行递归比较 
                if (!(_.has(b, key) && eq(a[key], b[key], aStack, bStack))) return false;
            }
        }

        aStack.pop();
        bStack.pop();
        return true;

    }


    _.isEqual = function (a, b) {
        return eq(a, b);
    };



    // 判断是否为空
    _.isEmpty = function (obj) {
        if (obj == null) return true;
        // 先判断是否是类数组或者是数组，
        // 其次判断是否是 数组，字符串，参数集合 中的一个,这样就可以使用length 属性来判断
        // 但是为什么要加上后面的三个呢？
        // 还有这样子，如果 obj 是页面里的节点集合呢？
        if (isArrayLike(obj) && (_.isArray(obj) || _.isString(obj) || _.isArguments(obj))) return obj.length === 0;
        // 对象的话，先获取其键的集合，在判断长度
        // 节点集合放到了这里来考虑了
        return _.keys(obj).length === 0;
    };



    _.isElement = function (obj) {
        return !!(obj && obj.nodeType === 1);
    };



    _.isArray = nativeIsArray || function (obj) {
        return toString.call(obj) === '[object Array]';
    };

    _.isObject = function (obj) {
        var type = typeof obj;
        // !!obj 用来排除 null  和 undefined
        // 这里的对象包括 function 和 object
        return type === 'function' || type === 'object' && !!obj;
    };



    // 其他 _.is[] 判断的集合
    _.each(['Arguments', 'Function', 'String', 'Number', 'Date', 'RegExp', 'Error', 'Symbol', 'Map', 'WeakMap', 'Set', 'WeakSet'], function (name) {
        _['is' + name] = function (obj) {
            return toString.call(obj) === '[object ' + name + ']';
        };
    });



    // _.isArguments 方法在 IE < 9 下的兼容
    // IE < 9 下对 arguments 调用 Object.prototype.toString.call 方法
    // 结果是 => [object Object]
    // 而并非我们期望的 [object Arguments]。
    // so 用是否含有 callee 属性来做兼容
    if (!_.isArguments(arguments)) {
        _.isArguments = function (obj) {
            return _.has(obj, 'callee');
        };
    }


    // 适当的优化 ，并且修复在老的 v8 上的 bug 
    // IE 11 (#1621), Safari 8 (#1929), and PhantomJS (#2236).
    var nodelist = root.document && root.document.childNodes;
    if (typeof /./ != 'function' && typeof Int8Array != 'object' && typeof nodelist != 'function') {
        _.isFunction = function (obj) {
            return typeof obj == 'function' || false;
        };
    }


    // 是否是有限数
    _.isFinite = function (obj) {
        return !_.isSymbol(obj) && isFinite(obj) && !isNaN(parseFloat(obj));
    };


    _.isNaN = function (obj) {
        return _.isNumber(obj) && isNaN(obj);
    };


    _.isBoolean = function (obj) {
        return obj === true || obj === false || toString.call(obj) === '[object Boolean]';
    };



    _.isNull = function (obj) {
        return obj === null;
    };

    // Is a given variable undefined?
    _.isUndefined = function (obj) {
        return obj === void 0;
    };


    // 对象中是否有指定键所对应的值，不包括原型链上的属性
    // 此方法的构造 与 deepGet 有点像
    _.has = function (obj, path) {
        if (!_.isArray(path)) {
            // path 不是数组，
            return obj != null && hasOwnProperty.call(obj, path);
        }
        var length = path.length;
        for (var i = 0; i < length; i++) {
            var key = path[i];
            if (obj == null || !hasOwnProperty.call(obj, key)) {
                return false;
            }
            obj = obj[key];
        }
        return !!length;
    };



    // 如果全局环境中已经使用了 `_` 变量
    // 可以用该方法返回其他变量
    // 继续使用 underscore 中的方法
    _.noConflict = function () {
        root._ = previousUnderscore;
        return this;
    };


    // 返回参数值
    _.identity = function (value) {
        return value
    }

    // 创建一个函数， 这个函数 返回相同的值 用来作为_.constant的参数。
    _.constant = function (value) {
        return function () {
            return value;
        };
    };


    _.noop = function () {};



    _.property = function (path) {
        if (!_.isArray(path)) { // 不是数组
            return shallowProperty(path)
        }

        return function (obj) {
            return deepGet(obj, path)
        }
    }



    _.propertyOf = function (obj) { // 闭包返回，柯里化
        if (obj == null) {
            return function () {};
        }
        return function (path) {
            return !_.isArray(path) ? obj[path] : deepGet(obj, path);
        };
    };



    // 返回一个函数，这个函数检查对象是否包含一系列给定的键值对
    _.matcher = _.matches = function (attrs) {
        attrs = _.extendOwn({}, attrs);
        return function (obj) {
            return _.isMatch(obj, attrs)
        }
    }



    // 调用给定的迭代函数n次,每一次调用iteratee传递index参数。生成一个返回值的数组
    _.times = function (n, iteratee, context) {
        var accum = Array(Math.max(0, n));
        iteratee = optimizeCb(iteratee, context, 1);
        for (var i = 0; i < n; i++) accum[i] = iteratee(i);
        return accum;
    };

    // 获取给的区间之间的随机数
    _.random = function (min, max) {
        if (max == null) {
            max = min;
            min = 0;
        }
        return min + Math.floor(Math.random() * (max - min + 1));
    };


    // 获取当前时间的 "时间戳"
    _.now = Date.now || function () {
        return new Date().getTime();
    };


    // 字符的转义
    var escapeMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '`': '&#x60;'
    };

    var unescapeMap = _.invert(escapeMap);

    // 转义HTML 字符串的工具函数，
    // 利用正则
    var createEscaper = function (map) {
        var escaper = function (match) {
            return map[match];
        };
        // Regexes for identifying a key that needs to be escaped.
        // (?:...) 只是组合，但是不记住这个括号里面的匹配的项，非捕获
        // _.keys(map).join('|')  -> '&' |'<' |'>' |'"' |"'" | '`'   正则里面的选择
        var source = '(?:' + _.keys(map).join('|') + ')';
        var testRegexp = RegExp(source); // 创建正则
        var replaceRegexp = RegExp(source, 'g'); // 创建全局的正则
        return function (string) {
            // 判断字符串是否为空
            string = string == null ? '' : '' + string;
            // 判断字符串是否满足正则，是则替换，否则直接返回字符串
            return testRegexp.test(string) ? string.replace(replaceRegexp, escaper) : string;
        };
    };
    _.escape = createEscaper(escapeMap);
    _.unescape = createEscaper(unescapeMap);


    _.result = function (obj, path, fallback) {
        if (!_.isArray(path)) path = [path]
        var length = path.length
        if (!length) {
            // 如果path 里面啥都没有
            // 判断fallback 是否是函数，是就执行
            return _.isFunction(fallback) ? fallback.call(obj) : fallback
        }

        // var object = {cheese: 'crumpets', stuff: function(){ return 'nonsense'; }};
        // _.result(object, ['cheese', '445'], function () {
        // console.log(99)
        // });
        //  ->99 
        // 所以说只要 path 中有一个在 obj 里面没有，就会执行 fallback 函数
        // 此外，这里的 path 如果是数组，那么应该是父子之间的关系或者如果是函数，那么后面迭代的属性就是函数返回值里面应有的属性
        // ， 这样后面得迭代才有意义，不然如果对应的结果是字符串，那么后面迭代只能是只付出的属性
        for (var i = 0; i < length; i++) {
            // 获取 对象中对应的键值
            var prop = obj == null ? void 0 : obj[path[i]];
            if (prop === void 0) {
                prop = fallback; // 只要有一个键值不存在，就将其等于 回调函数，并且直接中断循环
                i = length; // Ensure we don't continue iterating.
            }
            // 判断是否是函数，是就执行，反之直接返回
            obj = _.isFunction(prop) ? prop.call(obj) : prop;
        }
        return obj;
    }



    var idCounter = 0;
    // 创建唯一的 id ，如果有前缀就加上
    _.uniqueId = function (prefix) {
        var id = ++idCounter + '';
        return prefix ? prefix + id : id;
    };



    // 三种模板的定义，并且是全局
    // \s ： Unicode 任何空白符
    // \S : 任何非 Unicode 空白符之间外的字符
    // 非贪婪匹配
    _.templateSettings = {
        evaluate: /<%([\s\S]+?)%>/g,
        interpolate: /<%=([\s\S]+?)%>/g,
        escape: /<%-([\s\S]+?)%>/g
    };

    // . ：除换行符和其他Unicode 行终止符之外的任意字符
    var noMatch = /(.)^/;

    var escapes = {
        "'": "'",
        '\\': '\\',
        '\r': 'r', // 回车
        '\n': 'n', // 换行
        '\u2028': 'u2028', // 行分隔符
        '\u2029': 'u2029' // 段落分隔符
    };

    var escapeRegExp = /\\|'|\r|\n|\u2028|\u2029/g;

    var escapeChar = function (match) {
        return '\\' + escapes[match];
    };


    _.template = function (text, settings, oldSettings) {
        // 如果没有新的 setting ,就将老的 setting  设置为 settings
        if (!settings && oldSettings) settings = oldSettings
        // 合并 setting 和 _.templateSettings，但不进行覆盖
        settings = _.defaults({}, settings, _.templateSettings);

        // 正则的属性：
        //  var  escape = /<%-([\s\S]+?)%>/g
        // escape.source ="d(b+)d"   -> string
        // escape.lastIndex :下一个匹配的索引值

        var matcher = RegExp([
            (settings.escape || noMatch).source,
            (settings.interpolate || noMatch).source,
            (settings.evaluate || noMatch).source
        ].join('|') + '|$', 'g'); // -> /<%-([\s\S]+?)%>|<%=([\s\S]+?)%>|<%([\s\S]+?)%>|$/g


        var index = 0
        var source = "__p+="

        /**
        * _.template("Using 'with': <%= data.answer %>", {variable: 'data'})({answer: 'no'});

            以上述例子为例讲解


        */
        text.replace(matcher, function (match, escape, interceptor, evaluate, offset) {
            // \n ->\\n    \->\\ 
            // 此时 source ="__p+=Using \'with\': "
            // match =  <%= data.answer %>
            // escape = '  data.answer  '
            source = += text.slice(index, offset).replace(escapeRegExp, escapeChar)
            // 便于下次 slice 
            index = offset + match.length

            if (escape) {
                // 需要对变量进行编码
                // source ="__p+=Using \'with\': '+\n((__t=(  data.answer  ))==null?'':_.escape(__t))+\n'"
                source += "'+\n((__t=(" + escape + "))==null?'':_.escape(__t))+\n'";
            } else if (interpolate) {
                // 单纯地插入变量
                source += "'+\n((__t=(" + interpolate + "))==null?'':__t)+\n'";
            } else if (evaluate) {
                // 可以直接执行的 JavaScript 语句
                // 注意 "__p+="，__p 为渲染返回的字符串
                source += "';\n" + evaluate + "\n__p+='";
            }
            // 将匹配到的内容原样返回（Adobe VMs 需要返回 match 来使得 offset 值正常）
            return match;
        })

        // source ="__p+=Using \'with\': '+\n((__t=('  data.answer  '))==null?'':_.escape(__t))+\n'';\n"
        source += "';\n"

        // 如果没有指定  settings.variable 直接用 with 指定作用域
        // 关于 with
        // https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Statements/with
        if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';

        // 增设 print 函数，返回 所有参数 link 在一起的 字符串
        source = "var __t,__p='',__j=Array.prototype.join," +
            "print=function(){__p+=__j.call(arguments,'');};\n" +
            source + 'return __p;\n';
        /** 
         * source = (
         *      var __t,__p = '',__j = Array.prototype.join,
         *          print = function(){
         *              __p+=__j.call(arguments,"");
         *          }
         * 
         *          __p+=(Using \'with\': 
         *                  ((__t=('  data.answer  '))==null?'':_.escape(__t))
         *              )
         * 
         *          return __p
         * )
         */


        var render;
        try {
            // obj 为传入的 JSON 对象，传入 _ 参数使得函数内部能用 Underscore 的函数
            // source: 一个含有包括函数定义的JavaScript语句的字符串。

            // {variable: 'data'}

            /** 
             * render = function(data=obj,_){
             *      // 函数执行实体
             *   var __t,__p = '',__j = Array.prototype.join,
             *          print = function(){
             *              __p+=__j.call(arguments,"");
             *          }
             * 
             *          __p+=(Using \'with\': 
             *                  ((__t=('  data.answer  '))==null?'':_.escape(__t))
             *              )
             * 
             *          return __p
             * }
             */
            render = new Function(settings.variable || 'obj', '_', source);
        } catch (e) {
            e.source = source;
            throw e;
        }

        var template = function (data) {
            // data = {answer: 'no'}
            // 执行render 
            /** 
             * render = function(data=obj,_){
             *      // 函数执行实体
             *   var __t,
             *      __p = '',
             *      __j = Array.prototype.join,
             *      print = function(){
             *          __p+=__j.call(arguments,"");
             *      }
             * 
             *      __p+=(Using \'with\': 
             *              // data.answer = 'no'
             *              ((__t=('  data.answer  '))==null?'':_.escape(__t))
             *          )
             *      // __p = "Using \'with\':no"
             *      return __p
             * }
             */
            return render.call(this, data, _);
        };

        var argument = settings.variable || 'obj';

        /* 预编译模板对调试不可重现的错误很有帮助. 这是因为预编译的模板可以提供错误的代码行号和堆栈跟踪, 
        有些模板在客户端(浏览器)上是不能通过编译的 在编译好的模板函数上, 有 source 属性可以提供简单的预编译功能. */

        template.source = 'function(' + argument + '){\n' + source + '}';

        return template
    }


    _.chain = function (obj) {
        // 都先转为面向对象
        var instance = _(obj);
        // 是否是链式调用
        instance._chain = true;
        return instance;
    };


    var chainResult = function (instance, obj) {
        // 如果需要链式操作，则对 obj 运行 _.chain 方法，使得可以继续后续的链式操作
        // 如果不需要，直接返回 obj
        return instance._chain ? _(obj).chain() : obj;
    };



    _.mixin = function (obj) {
        // _.functions(obj)  -> 返回所有的obj 属性值是函数的数组
        _.each(_.functions(obj), function (name) {
            // 将obj 的方法合并到 undescore 里面 
            var func = _[name] = obj[name];
            // 之前的 underscore的属性是直接绑在 _(){}函数上的，现在在underscore 上也绑定这些函数
            _.prototype[name] = function () { // 并绑定在underscore 的原型上
                var args = [this._wrapped]; // _._wrapped作为第一个参数  是 _(obj) 里的 obj  
                push.apply(args, arguments); // 在将后续参数加入已有的参数里面
                // 执行各个函数，并将返回值作为 chainResult的参数
                // 使得如果是链式调用，则将函数的返回值交给chainResult 函数，让该函数重新包装返回值
                // 使得返回值也具有 underscore 的所有属性
                // 同时将 this 传过去，保证了是否需要继续链式调用
                return chainResult(this, func.apply(_, args));
            };
        });
        // 返回改造后的 _
        return _;
    };


    // 将所有的方法加到 被包裹的 obj 上
    _.mixin(_)


    // 将 Array 原型链上会改变原始数组的方法都添加到 underscore 中
    _.each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function (name) {
        var method = ArrayProto[name];
        _.prototype[name] = function () {
            var obj = this._wrapped;
            method.apply(obj, arguments);   // 执行该数组方法
            if ((name === 'shift' || name === 'splice') && obj.length === 0) delete obj[0];
            return chainResult(this, obj);
        };
    });


    //将 Array 原型链上不会改变原始数组的方法都添加到 underscore 中
    _.each(['concat', 'join', 'slice'], function (name) {
        var method = ArrayProto[name];
        _.prototype[name] = function () {
            return chainResult(this, method.apply(this._wrapped, arguments));
        };
    });


    _.prototype.value = function () {
        return this._wrapped;
    };


    // 为引擎操作中使用的某些方法（如算术和JSON字符串化）提供解包代理。
    _.prototype.valueOf = _.prototype.toJSON = _.prototype.value;


    _.prototype.toString = function () {
        return String(this._wrapped);
    };


    // 兼容AMD
    if (typeof define == 'function' && define.amd) {
        define('underscore', [], function () {
            return _;
        });
    }

}())