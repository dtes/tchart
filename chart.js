// Copyright 2019 Denis Olshin

// Detecting browsers
var isOpera = (!!window.opr && !!opr.addons) || !!window.opera || navigator.userAgent.indexOf(' OPR/') >= 0;
var isSafari = /constructor/i.test(window.HTMLElement) || (function (p) { return p.toString() === "[object SafariRemoteNotification]"; })(!window.safari || (typeof safari !== 'undefined' && safari.pushNotification)) || navigator.userAgent.indexOf('Safari') != -1;
var isChrome = !!window.chrome && (!!window.chrome.webstore || !!window.chrome.runtime);

// Utility functions
function createEl(parent, name, tag) {
  var el;
  if (tag == 'svg') {
    el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.setAttribute('class', 'a-chart__' + name);
    parent.appendChild(el);
    return el;
  } else {
    el = document.createElement(tag || 'div');
    el.className = 'a-chart__' + name;
    parent.appendChild(el);
    return el;
  }
}

function createLinePath(svg, xs, series, width) {
  var line, i, d = [];
  line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  line.setAttribute('stroke', series.color);
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke-width', width + 'px');
  line.setAttribute('vector-effect', 'non-scaling-stroke');
  line.setAttribute('stroke-linejoin', 'round');

  for (i = 0; i < series.pts.length; i++) {
    d.push(i == 0 ? 'M' : 'L');
    d.push((xs[i] - xs[0]) / 1e7 + ',' + series.pts[i]);
  }
  line.setAttribute('d', d.join(' '));

  svg.appendChild(line);
  return line;
}

function createBar(svg, xs, series, prevSeries) {
  var width = (xs[1] - xs[0]) / 1e7;
  var barGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  barGroup.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.appendChild(barGroup);

  for (let i = 0; i < series.pts.length; i++) {
    var bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bar.setAttribute('vector-effect', 'non-scaling-stroke');
    bar.setAttribute("x", ((xs[i] - xs[0]) / 1e7));
    bar.setAttribute("y", prevSeries ? prevSeries.pts[i] : 0);
    bar.setAttribute("height", prevSeries ? series.pts[i] - prevSeries.pts[i] : series.pts[i]);
    // bar.setAttribute("y", 0);
    // bar.setAttribute("height", series.pts[i]);
    bar.setAttribute("width", width);
    bar.setAttribute("fill", series.color);
    barGroup.appendChild(bar);
  }
  return barGroup;
}

function createArea(svg, xs, series, prevSeries) {
  var area, i, d = [];
  area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  area.setAttribute('stroke', series.color);
  area.setAttribute('fill', series.color);
  area.setAttribute('vector-effect', 'non-scaling-stroke');
  area.setAttribute('stroke-linejoin', 'round');

  for (i = series.pts.length - 1; i >= 0; i--) {
    d.push(i == series.pts.length-1 ? 'M' : 'L');
    d.push((xs[i] - xs[0]) / 1e7 + ',' + (prevSeries ? prevSeries.pts[i] : 0));
  }

  for (i = 0; i < series.pts.length; i++) {
    // d.push(i == 0 ? 'M' : 'L');
    d.push('L');
    d.push((xs[i] - xs[0]) / 1e7 + ',' + series.pts[i]);
  }
  // d.push('z');
  area.setAttribute('d', d.join(' '));

  svg.appendChild(area);
  return area;
}

function getElementData(el, name) {
  if ('dataset' in el) {
    if (name in el.dataset) {
      return el.dataset[name];
    } else {
      return null;
    }
  }

  if (el.hasAttribute('data-' + name)) {
    return el.getAttribute('data-' + name);
  } else {
    return null;
  }
}

function setElementData(el, name, value) {
  if ('dataset' in el) {
    el.dataset[name] = value;
  } else {
    el.setAttribute('data-' + name, value);
  }
}

function animateTransform(el, scale, translate) {
  var sourceTime, sourceValue, targetValue;
  function update() {
    var step = Math.min(1, (Date.now() - sourceTime) / 300);
    step = step * step;
    setElementData(el, 'scaleY', scale[1] = sourceValue * (1 - step) + targetValue * step);
    el.setAttribute('transform', (translate ? 'translate(' + translate.join(',') + ') ' : '') + 'scale(' + scale.join(',') + ')');
    if (Math.abs(scale[1] - targetValue) > 1e-7) {
      setElementData(el, 'anim', requestAnimationFrame(update));
    }
  }

  // SVG in Chrome animates transforms both in styles and in attributes (via transitions)
  if (isChrome || isOpera) {
    el.setAttribute('transform', (translate ? 'translate(' + translate.join(',') + ') ' : '') + 'scale(' + scale.join(',') + ')');
  } else
    // SVG in Safari animates transforms only if it specified as style
    if (isSafari) {
      el.style.transform = (translate ? 'translate(' + translate.join('px,') + 'px) ' : '') + 'scale(' + scale.join(',') + ')';
    } else {
      // Firefox ignores non-scaling-stroke if transform is specified as style
      // It also means that we are forced to animate scale transitions by hand
      el.style.transition = '';
      if (getElementData(el, 'scaleY') === null) {
        setElementData(el, 'scaleY', scale[1]);
        el.setAttribute('transform', (translate ? 'translate(' + translate.join(',') + ') ' : '') + 'scale(' + scale.join(',') + ')');
        return;
      }

      // Manually animate scaleY
      if (getElementData(el, 'anim') !== null) {
        if (Math.abs(parseFloat(getElementData(el, 'scaleY1')) - scale[1]) < 1e-7) {
          return;
        }
        cancelAnimationFrame(getElementData(el, 'anim'));
      }

      sourceTime = Date.now();
      sourceValue = parseFloat(getElementData(el, 'scaleY'));
      setElementData(el, 'scaleY1', targetValue = scale[1]);
      update();
    }
}

function createDraggableBehavior(chart, el, handler, endHandler, attachToWrapper, hover) {
  var startX, oldMinX, oldMaxX, drag;
  function onDragStart(e) {
    if (!attachToWrapper || e.target === el) {
      var touch = e.touches ? e.touches[0] : e;
      startX = touch.pageX;
      oldMinX = chart.minX;
      oldMaxX = chart.maxX;
      drag = hover && (e.type == 'mousedown');

      document.body.addEventListener(e.touches ? 'touchmove' : 'mousemove', onDrag, false);
      document.body.addEventListener(e.touches ? 'touchend' : 'mouseup', onDragEnd, false);
      onDrag(e);

      if (attachToWrapper) {
        e.preventDefault && e.preventDefault();
        e.stopPropagation && e.stopPropagation();
        return false;
      }
    }
  }

  function onDrag(e) {
    var touch = e.touches ? e.touches[0] : e;
    handler(e, touch.pageX - startX, {
      minX: oldMinX,
      maxX: oldMaxX,
    }, drag);
  }

  function onDragEnd(e) {
    endHandler && endHandler(e, drag);
    if (drag) {
      drag = false;
    } else {
      document.body.removeEventListener('touchmove', onDrag, false);
      document.body.removeEventListener('touchend', onDragEnd, false);
      document.body.removeEventListener('mousemove', onDrag, false);
      document.body.removeEventListener('mouseup', onDragEnd, false);
    }
  }

  if (attachToWrapper) {
    chart.wrapperEl.addEventListener('touchstart', onDragStart, false);
    chart.wrapperEl.addEventListener('mousedown', onDragStart, false);
  } else {
    el.addEventListener('touchstart', onDragStart, false);
    el.addEventListener('mousedown', onDragStart, false);
    if (hover) {
      el.addEventListener('mouseenter', onDragStart, false);
      el.addEventListener('mouseleave', onDragEnd, false);
    }
  }
}

var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatDate(date, showWeekday, showDay, showYear) {
  var result = [];
  date = new Date(date);
  if (showWeekday) {
    result.push(WEEKDAYS[date.getDay()], ', ');
  }
  if (showDay) {
    result.push(date.getDate());
  }
  result.push(' ', MONTHS[date.getMonth()]);
  if (showYear) {
    result.push(' ', date.getFullYear());
  }
  return result.join('');
}

function formatNumber(n, shorten) {
  if (shorten) {
    if (n >= 1000000) {
      // Allow 1 decimal digit max
      return Math.floor(n / 100000) / 10 + 'M';
    }
    if (n >= 1000) {
      return Math.floor(n / 100) / 10 + 'K';
    }
  }
  return n.toLocaleString();
}

function makePercentageSeries(series) {
  var colsSum = [];
  for (var k = 0; k < series.length; k++) {
    series[k].sum = colsSum;
    if (!series[k].isActive) continue;
    for (var j = 0; j < series[k].pts.length; j++) {
      colsSum[j] = (colsSum[j] || 0) + series[k].pts_orig[j];
    }
  }

  for (var k = 0; k < series.length; k++) {
    if (!series[k].isActive) continue;
    for (var j = 0; j < series[k].pts.length; j++) {
      series[k].pts_perc_orig[j] = series[k].pts_orig[j] * 100 / colsSum[j];
    }
  }
}

function makeStackedSeries(series) {
  for (var k = 0; k < series.length; k++) {
    if (series[k].percentage) {
      series[k].pts = series[k].pts_perc_orig.slice(0);
    } else {
      series[k].pts = series[k].pts_orig.slice(0);
    }
  }
  var prevSeries = null;
  for (var k = 0; k < series.length; k++) {
    for (let j = 0; j < series[k].pts.length; j++) {
      series[k].pts[j] += (prevSeries ? prevSeries.pts[j] : 0);
    }
    if (series[k].isActive) prevSeries = series[k];
  }
}

// ============================================================================

function TChart(wrapperId, data) {
  console.log({ data: data });
  var i, j, k, pts, label, icon;
  var supportedChartTypes = ['line', 'bar', 'area'];
  // Constants
  this.MIN_WINDOW_SIZE = 40;
  this.MIN_DAY_SIZE = 70;
  this.SIDE_PADDING = 18;
  this.y_scaled = data.y_scaled;
  this.stacked = data.stacked;
  this.percentage = data.percentage;
  this.hasLongVal = false;
  this.ratio = 1;

  // Convert input data to more usable format
  this.series = [];
  for (k in data.types) {
    for (j = 0; j < data.columns.length; j++) {
      if (data.columns[j][0] == k) {
        pts = data.columns[j].slice(1);
      }
    }

    if (data.types[k] == 'x') {
      this.xs = pts;
    } else if (supportedChartTypes.indexOf(data.types[k]) > -1) {
      var min = pts[0], max = pts[0];
      for (i = 0; i < pts.length; i++) {
        min = Math.min(min, pts[i]);
        max = Math.max(max, pts[i]);
      }

      this.series.push({
        type: data.types[k],
        isActive: true,
        pts: pts,
        pts_orig: pts.slice(0),
        pts_perc_orig: [],
        name: data.names[k],
        color: data.colors[k],
        y_scaled: data.y_scaled,
        stacked: data.stacked,
        percentage: data.percentage,
        ratio: 1,
        min: min,
        max: max
      });
    } else {
      throw new Error('Unsupported series type: "' + data.types[k] + '"');
    }
  }

  // Check for overload
  var maxVal = this.series[0].max;
  for (i = 0; i < this.series.length; i++) {
    maxVal = Math.max(maxVal, this.series[i].max);
  }

  var ratio = ('' + maxVal).length - 7;
  if (ratio >= 1) {
    this.ratio = Math.pow(10, ratio);
    for (i = 0; i < this.series.length; i++) {
      for (j = 0; j < this.series[i].pts.length; j++) {
        this.series[i].pts[j] /= this.ratio;
      }
    }
  }

  // PERCENTAGE
  if (data.percentage) {
    makePercentageSeries(this.series);
  }

  // Y-SCALED
  if (data.y_scaled) {
    var min1 = this.series[0].min;
    var max1 = this.series[0].max;
    var min2 = this.series[1].min;
    var max2 = this.series[1].max;

    this.series[1].ratio = (max1 - min1) / (max2 - min2);

    for (k = 0; k < this.series.length; k++) {
      var series = this.series[k];
      if (series.ratio != 1) {
        for (j = 0; j < series.pts.length; j++) {
          series.pts[j] *= series.ratio;
        }
      }
    }
  }

  // STACKED
  if (data.stacked) {
    makeStackedSeries(this.series);
  }

  // Event handlers
  this.onLegendLabelToggle = function (index, label) {
    var activeSeries = this.series.filter((s, idx) => s.isActive && idx != index)
    // preventing to switch last label
    if (activeSeries.length == 0) {
      label.classList.add('shakable');
      setTimeout(function () { label.classList.remove('shakable') }, 200);
      return;
    }

    this.series[index].isActive = !this.series[index].isActive;

    if (data.percentage) {
      makePercentageSeries(this.series)
    }

    if (data.stacked) {
      // remove chilren
      this.viewGroup.innerHTML = '';
      this.viewPaths = [];
      this.overviewSvg.innerHTML = '';
      this.overviewPaths = [];

      // recalc stacked series points
      makeStackedSeries(this.series);
      var prevSeries = null;
      // recreate charts
      for (i = 0; i < this.series.length; i++) {
        if (this.series[i].type == 'line') {
          this.viewPaths.push(createLinePath(this.viewGroup, this.xs, this.series[i], 2.2));
          this.overviewPaths.push(createLinePath(this.overviewSvg, this.xs, this.series[i], 1.2));
        } else if (this.series[i].type == 'bar') {
          this.viewPaths.push(createBar(this.viewGroup, this.xs, this.series[i], prevSeries));
          this.overviewPaths.push(createBar(this.overviewSvg, this.xs, this.series[i], prevSeries));
        } else if (this.series[i].type == 'area') {
          this.viewPaths.push(createArea(this.viewGroup, this.xs, this.series[i], prevSeries));
          this.overviewPaths.push(createArea(this.overviewSvg, this.xs, this.series[i], prevSeries));
        }
        if (this.series[i].isActive) prevSeries = this.series[i];
      }
    }

    this.redraw();
  }

  this.onYLineTransitionEnd = function (e) {
    for (var i = 0; i < this.yLines.length; i++) {
      if (this.yLines[i].lineEl == e.target) {
        e.target.removeEventListener('transitionend', this.onYLineTransitionEnd, true);
        this.gridContainerEl.removeChild(this.yLines[i].labelEl);
        this.gridContainerEl.removeChild(this.yLines[i].lineEl);
        this.yLines.splice(i, 1);
        return;
      }
    }
  }.bind(this);

  this.onXLabelTransitionEnd = function (e) {
    for (var i = 0; i < this.xLabels.length; i++) {
      if (this.xLabels[i].el == e.target) {
        e.target.removeEventListener('transitionend', this.onXLabelTransitionEnd, true);
        this.xAxisEl.removeChild(this.xLabels[i].el);
        this.xLabels.splice(i, 1);
        return;
      }
    }
  }.bind(this);

  this.gminX = this.xs[0];
  this.gmaxX = this.xs[this.xs.length - 1];
  this.minX = this.gmaxX - 4e9;
  this.maxX = this.gmaxX;
  this.selectionIndex = null;

  // Build static DOM structure
  this.wrapperEl = document.getElementById(wrapperId);
  this.wrapperEl.classList.add('a-chart');
  this.viewEl = createEl(this.wrapperEl, 'view');
  createDraggableBehavior(this, this.viewEl, function (e, delta, old, drag) {
    var i, touch, x;
    if (drag) {
      delta = -delta / this.scaleX;
      delta = Math.max(delta, this.gminX - old.minX);
      delta = Math.min(delta, this.gmaxX - old.maxX);
      this.minX = old.minX + delta;
      this.maxX = old.maxX + delta;
      //this.selectionIndex = null;
      for (i = 0; i < this.selectionBubbleEls.length; i++) {
        this.selectionBubbleEls[i].classList.add('is-animated');
      }
      this.redraw();
      return;
    }

    touch = e.touches ? e.touches[0] : e;
    x = this.minX + (touch.pageX - this.viewEl.getBoundingClientRect().left - window.pageXOffset - this.SIDE_PADDING) / this.scaleX;
    this.selectionIndex = 0;
    for (i = 1; i < this.xs.length; i++) {
      if (this.xs[i] < this.minX || this.xs[i] > this.maxX) {
        continue;
      }
      if (Math.abs(this.xs[i] - x) < Math.abs(this.xs[this.selectionIndex] - x)) {
        this.selectionIndex = i;
      }
    }

    for (i = 0; i < this.selectionBubbleEls.length; i++) {
      this.selectionBubbleEls[i].classList.remove('is-animated');
    }
    this.redraw();
  }.bind(this), function (e, drag) {
    for (var i = 0; i < this.selectionBubbleEls.length; i++) {
      this.selectionBubbleEls[i].classList.toggle('is-animated', !drag);
    }
    if (!e.touches && !drag) {
      this.selectionIndex = null;
      this.redraw();
    }
  }.bind(this), false, true);
  document.body.addEventListener('touchstart', function (e) {
    var el = e.target;
    while (el !== document.body) {
      if (el === this.wrapperEl) {
        return;
      }
      el = el.parentNode;
    }

    this.selectionIndex = null;
    this.redraw();
  }.bind(this), true);

  this.gridContainerEl = createEl(this.viewEl, 'grid-container');
  this.yLines = [];
  this.yLinesRight = [];

  this.selectionLineEl = createEl(this.viewEl, 'selection-line');

  this.viewSvg = createEl(this.viewEl, 'view-svg', 'svg');
  this.viewGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  this.viewGroup.setAttribute('vector-effect', 'non-scaling-stroke');
  this.viewSvg.appendChild(this.viewGroup);
  this.viewPaths = [];
  var prevSeries = null;
  for (i = 0; i < this.series.length; i++) {
    if (this.series[i].type == 'line') {
      this.viewPaths.push(createLinePath(this.viewGroup, this.xs, this.series[i], 2.2));
    } else if (this.series[i].type == 'bar') {
      this.viewPaths.push(createBar(this.viewGroup, this.xs, this.series[i], prevSeries));
    } else if (this.series[i].type == 'area') {
      this.viewPaths.push(createArea(this.viewGroup, this.xs, this.series[i], prevSeries));
    }
    if (this.series[i].isActive) {
      prevSeries = this.series[i];
    }
  }

  this.topOverlayEl = createEl(this.viewEl, 'top-overlay');

  this.selectionBubbleEls = [];
  for (i = 0; i < this.series.length; i++) {
    this.selectionBubbleEls.push(createEl(this.viewEl, 'selection-bubble is-series-' + i));
  }
  this.selectionBoxEl = createEl(this.viewEl, 'selection-box');

  this.xAxisEl = createEl(this.wrapperEl, 'x-axis');
  this.xLabels = [];

  this.overviewEl = createEl(this.wrapperEl, 'overview');
  this.overviewSvg = createEl(this.overviewEl, 'overview-svg', 'svg');
  this.overviewPaths = [];
  var prevSeries = null;
  for (i = 0; i < this.series.length; i++) {
    if (this.series[i].type == 'line') {
      this.overviewPaths.push(createLinePath(this.overviewSvg, this.xs, this.series[i], 1.2));
    } else if (this.series[i].type == 'bar') {
      this.overviewPaths.push(createBar(this.overviewSvg, this.xs, this.series[i], prevSeries));
    } else if (this.series[i].type == 'area') {
      this.overviewPaths.push(createArea(this.overviewSvg, this.xs, this.series[i], prevSeries));
    }
    if (this.series[i].isActive) {
      prevSeries = this.series[i];
    }
  }

  this.overviewWindowEl = createEl(this.overviewEl, 'overview-window');
  createDraggableBehavior(this, this.overviewWindowEl, function (e, delta, old) {
    delta = delta / this.gscaleX;
    delta = Math.max(delta, this.gminX - old.minX);
    delta = Math.min(delta, this.gmaxX - old.maxX);
    this.minX = old.minX + delta;
    this.maxX = old.maxX + delta;
    this.selectionIndex = null;
    this.redraw();
  }.bind(this), false, true);
  this.overviewHandleLeftEl = createEl(this.overviewWindowEl, 'overview-handle is-left');
  createDraggableBehavior(this, this.overviewHandleLeftEl, function (e, delta, old) {
    delta = delta / this.gscaleX;
    this.minX = Math.max(this.gminX, old.minX + delta);
    this.minX = Math.min(this.minX, this.maxX - this.MIN_WINDOW_SIZE / this.gscaleX);
    this.selectionIndex = null;
    this.redraw();
  }.bind(this), false, true);
  this.overviewHandleRightEl = createEl(this.overviewWindowEl, 'overview-handle is-right');
  createDraggableBehavior(this, this.overviewHandleRightEl, function (e, delta, old) {
    delta = delta / this.gscaleX;
    this.maxX = Math.max(this.minX + this.MIN_WINDOW_SIZE / this.gscaleX, old.maxX + delta);
    this.maxX = Math.min(this.maxX, this.gmaxX);
    this.selectionIndex = null;
    this.redraw();
  }.bind(this), false, true);
  createDraggableBehavior(this, this.overviewSvg, function (e, delta) {
    var touch = e.touches ? e.touches[0] : e,
      sz = Math.max(Math.abs(delta), this.MIN_WINDOW_SIZE) / this.gscaleX,
      x1 = touch.pageX - this.overviewSvg.getBoundingClientRect().left - window.pageXOffset,
      mid = this.gminX + (x1 - delta / 2) / this.gscaleX;
    mid = Math.max(this.gminX + this.MIN_WINDOW_SIZE / this.gscaleX / 2, mid);
    mid = Math.min(this.gmaxX - this.MIN_WINDOW_SIZE / this.gscaleX / 2, mid);
    this.minX = Math.max(this.gminX, mid - sz / 2);
    this.maxX = Math.min(mid + sz / 2, this.gmaxX);
    this.selectionIndex = null;
    this.redraw();
  }.bind(this));
  this.overviewWindowEl.addEventListener('dblclick', function (e) {
    if (Math.abs(this.minX - this.gminX) < 1e-7 && Math.abs(this.maxX - this.gmaxX) < 1e-7) {
      var mid = this.gminX + (e.pageX - this.overviewEl.getBoundingClientRect().left - window.pageXOffset) / this.gscaleX;
      mid = Math.max(this.gminX + this.MIN_WINDOW_SIZE / this.gscaleX / 2, mid);
      mid = Math.min(this.gmaxX - this.MIN_WINDOW_SIZE / this.gscaleX / 2, mid);
      this.minX = mid - this.MIN_WINDOW_SIZE / this.gscaleX / 2;
      this.maxX = mid + this.MIN_WINDOW_SIZE / this.gscaleX / 2;
    } else {
      this.minX = this.gminX;
      this.maxX = this.gmaxX;
    }
    this.selectionIndex = null;
    this.redraw();
  }.bind(this), false);
  this.overviewEl.addEventListener('wheel', function (e) {
    if (!e.ctrlKey) {
      // To allow scrolling
      return;
    }

    var pos = 0.5, mid = (this.minX + this.maxX) / 2,
      x = this.gminX + (e.pageX - this.overviewEl.getBoundingClientRect().left - window.pageXOffset) / this.gscaleX,
      sz = this.maxX - this.minX;
    if (x >= this.minX && x <= this.maxX) {
      pos = (x - this.gminX) / (this.gmaxX - this.gminX);
      mid = x;
    }
    sz = Math.max(sz - e.deltaY / this.gscaleX, this.MIN_WINDOW_SIZE / this.gscaleX);
    if (mid - sz * (1 - pos) <= this.gminX) {
      this.minX = this.gminX;
      this.maxX = Math.min(this.minX + sz, this.gmaxX);
    } else if (mid + sz * pos >= this.gmaxX) {
      this.maxX = this.gmaxX;
      this.minX = Math.max(this.maxX - sz, this.gminX);
    } else {
      this.minX = mid - sz * (1 - pos);
      this.maxX = mid + sz * pos;
    }
    e.preventDefault();
    this.redraw();
  }.bind(this), false);

  this.legendEl = createEl(this.wrapperEl, 'legend');
  this.legendLabelEls = [];
  for (i = 0; i < this.series.length; i++) {
    label = createEl(this.legendEl, 'legend-label is-series-' + i + ' is-active');
    label.innerText = this.series[i].name;
    icon = createEl(label, 'legend-checkmark');
    icon.style.color = this.series[i].color;
    label.addEventListener('click', this.onLegendLabelToggle.bind(this, i, label), true);
    this.legendLabelEls.push(label);
  }

  this.redraw();

  setTimeout(function () {
    this.wrapperEl.classList.add('is-animated');
  }.bind(this), 0);

  window.addEventListener('resize', this.redraw.bind(this), true);
  this.initialized = true;
}

// ==============================================================================

TChart.prototype.redraw = function () {
  var W = this.viewEl.offsetWidth - this.SIDE_PADDING * 2,
    H = this.viewEl.offsetHeight,
    oH = this.overviewEl.offsetHeight,
    maxY = 0, gmaxY = 0, secondLineRatio = 1,
    firstX = null, noData = false, i, j, x, y,
    scaleX = W / (this.maxX - this.minX),
    gscaleX = W / (this.gmaxX - this.gminX),
    order, scaleX, gscaleX, scaleY, gscaleY, series,
    oldScaleY = this.scaleY, add, line, updateLine, updateLabel,
    stepX, stepY, day, label, left, percent, highest, windowL, windowR, html;

  for (i = 0; i < this.series.length; i++) {
    series = this.series[i];
    secondLineRatio = series.ratio;
    if (series.isActive) {
      for (j = 0; j < this.xs.length; j++) {
        if (this.minX <= this.xs[j] && this.xs[j] <= this.maxX) {
          maxY = Math.max(maxY, series.pts[j]);
          if (firstX === null) {
            firstX = this.xs[j];
          }
        }
        gmaxY = Math.max(gmaxY, series.pts[j]);
      }
    }
  }

  if (this.percentage) {
    maxY = 100;
  }

  order = Math.pow(10, Math.floor(Math.log(maxY) * Math.LOG10E)) / 2;
  maxY = Math.ceil(maxY / order) * order;
  stepY = maxY / 5;
  scaleY = (H - 30) / maxY;
  gscaleY = (oH - 4) / gmaxY;
  oldScaleY = this.scaleY;

  // Update horizontal grid lines & labels
  add = {};
  // if (!noData) {
  for (i = 0; i <= 5; i++) {
    add[stepY * i] = true;
  }
  // }

  for (i = 0; i < this.yLines.length; i++) {
    line = this.yLines[i];
    if (add[line.y]) {
      line.lineEl.style.opacity = 1;
      line.labelEl.style.opacity = 1;
      line.labelElRight.style.opacity = 1;
      delete add[line.y];
      line.lineEl.removeEventListener('transitionend', this.onYLineTransitionEnd, true);
    } else {
      line.lineEl.style.opacity = 0;
      line.labelEl.style.opacity = 0;
      line.labelElRight.style.opacity = 0;
      line.lineEl.addEventListener('transitionend', this.onYLineTransitionEnd, true);
    }
    line.lineEl.style.bottom = line.y * scaleY + 'px';
    line.labelEl.style.bottom = line.y * scaleY + 'px';
    line.labelElRight.style.bottom = line.y * scaleY + 'px';
  }

  for (y in add) {
    line = {
      y: y,
      lineEl: createEl(this.gridContainerEl, 'y-line'),
      labelEl: createEl(this.gridContainerEl, 'y-label'),
      labelElRight: createEl(this.gridContainerEl, 'y-label right'),
    };
    line.labelEl.innerText = formatNumber(this.hasLongVal ? y * this.ration : y, true);
    line.labelElRight.innerText = formatNumber(this.y_scaled ? y / secondLineRatio : '', true);
    if (this.scaleY !== undefined) {
      line.lineEl.style.bottom = line.y * oldScaleY + 'px';
      line.labelEl.style.bottom = line.y * oldScaleY + 'px';
      line.labelElRight.style.bottom = line.y * oldScaleY + 'px';
    }

    updateLine = function (line) {
      line.lineEl.style.opacity = 1;
      line.lineEl.style.bottom = line.y * scaleY + 'px';
      line.labelEl.style.opacity = 1;
      line.labelEl.style.bottom = line.y * scaleY + 'px';
      line.labelElRight.style.opacity = 1;
      line.labelElRight.style.bottom = line.y * scaleY + 'px';
    }.bind(this, line);

    if (this.initialized) {
      setTimeout(updateLine, 0);
    } else {
      updateLine();
    }
    this.yLines.push(line);
  }

  // Update horizontal axis labels
  stepX = 1000 * 60 * 60 * 24;
  while (stepX * scaleX < this.MIN_DAY_SIZE) {
    stepX *= 2;
  }
  day = Math.floor(firstX / stepX) * stepX;

  add = {};
  while ((day - this.minX - stepX) * scaleX < W && day <= this.gmaxX) {
    if (day >= this.gminX) {
      add[day] = true;
    }
    day += stepX;
  }

  for (i = 0; i < this.xLabels.length; i++) {
    label = this.xLabels[i];
    if (add[label.x]) {
      label.el.style.opacity = 1;
      delete add[label.x];
      label.el.removeEventListener('transitionend', this.onXLabelTransitionEnd, true);
    } else {
      label.el.style.opacity = 0;
      label.el.addEventListener('transitionend', this.onXLabelTransitionEnd, true);
    }
    label.el.style.left = ((label.x - this.minX) * scaleX + this.SIDE_PADDING * 2 - 50) + 'px';
  }

  for (x in add) {
    label = {
      x: x,
      el: createEl(this.xAxisEl, 'x-label'),
    };
    label.el.innerText = formatDate(parseFloat(x), false, true);
    label.el.style.left = ((label.x - this.minX) * scaleX + this.SIDE_PADDING * 2 - 50) + 'px';
    updateLabel = function (label) {
      label.el.style.opacity = 1;
    }.bind(this, label);

    if (this.initialized) {
      setTimeout(updateLabel, 0);
    } else {
      updateLabel();
    }
    this.xLabels.push(label);
  }

  // Update main view paths
  animateTransform(this.viewGroup, [scaleX * 1e7, 1], [(this.gminX - this.minX) * scaleX + this.SIDE_PADDING, 0]);
  for (i = 0; i < this.viewPaths.length; i++) {
    this.viewPaths[i].style.opacity = this.series[i].isActive ? 1 : 0;
    animateTransform(this.viewPaths[i], [1, scaleY]);
  }

  // Update selection
  if (this.selectionIndex === null) {
    this.selectionLineEl.style.display = 'none';
    for (i = 0; i < this.selectionBubbleEls.length; i++) {
      this.selectionBubbleEls[i].style.display = 'none';
    }
    this.selectionBoxEl.style.display = 'none';
  } else {
    left = (this.xs[this.selectionIndex] - this.minX) * scaleX + this.SIDE_PADDING;
    percent = (this.xs[this.selectionIndex] - this.minX) / (this.maxX - this.minX);
    highest = 0;
    this.selectionLineEl.style.display = 'block';
    this.selectionLineEl.style.left = left + 'px';
    for (i = 0; i < this.selectionBubbleEls.length; i++) {
      y = this.series[i].pts[this.selectionIndex] * scaleY;
      this.selectionBubbleEls[i].style.display = 'block';
      this.selectionBubbleEls[i].style.opacity = this.series[i].isActive ? 1 : 0;
      this.selectionBubbleEls[i].style.borderColor = this.series[i].color;
      this.selectionBubbleEls[i].style.left = left + 'px';
      this.selectionBubbleEls[i].style.bottom = y + 'px';
      if (this.series[i].isActive) {
        highest = Math.min(highest, H - y - this.selectionBoxEl.offsetHeight - 15);
      }
    }

    html = [];
    html.push('<div class="a-chart__selection-box-labels">');
    html.push(
      '<div class="space-between">',
      '<b>', formatDate(this.xs[this.selectionIndex], true, true, true), '</b>',
      '<div> > </div>',
      '</div>'
    );
    var percent = '';
    for (i = 0; i < this.series.length; i++) {
      if (this.series[i].isActive) {
        html.push('<div class="space-between">',
          '<span>', 
          (this.percentage ? Math.round(this.series[i].pts_perc_orig[this.selectionIndex]) + '% ' : ''),
          this.series[i].name, 
          '</span>',
          '<b style="color: ', this.series[i].color, '">', formatNumber(this.series[i].pts_orig[this.selectionIndex]), '</b>',
          '</div>');
      }
    }
    html.push('</div>');
    this.selectionBoxEl.innerHTML = html.join('');

    this.selectionBoxEl.style.display = 'block';
    this.selectionBoxEl.style.left =
      Math.max(this.SIDE_PADDING / 2,
        Math.min(W - this.selectionBoxEl.offsetWidth + this.SIDE_PADDING * 3 / 2,
          left - (this.selectionBoxEl.offsetWidth - this.SIDE_PADDING) * percent - this.SIDE_PADDING / 2)) + 'px';
    this.selectionBoxEl.style.top = highest + 'px';
  }

  // Update overview paths
  for (i = 0; i < this.overviewPaths.length; i++) {
    this.overviewPaths[i].style.opacity = this.series[i].isActive ? 1 : 0;
    animateTransform(this.overviewPaths[i], [gscaleX * 1e7, gscaleY]);
  }

  // Update overview window
  windowL = (this.minX - this.gminX) / (this.gmaxX - this.gminX);
  windowR = (this.maxX - this.gminX) / (this.gmaxX - this.gminX);
  this.overviewWindowEl.style.left = (windowL * 100) + '%';
  this.overviewWindowEl.style.right = (100 - windowR * 100) + '%';

  // Update legend labels
  for (i = 0; i < this.series.length; i++) {
    this.legendLabelEls[i].classList.toggle('is-active', this.series[i].isActive);
  }

  this.scaleX = scaleX;
  this.scaleY = scaleY;
  this.gscaleX = gscaleX;
  this.gscaleY = gscaleY;
}