import {PRIMARY_STATISTICS} from '../constants';
import {
  formatNumber,
  formatTimeseriesTickX,
  capitalize,
} from '../utils/commonfunctions';
import {useResizeObserver} from '../utils/hooks';

import classnames from 'classnames';
import * as d3 from 'd3';
import equal from 'fast-deep-equal';
import produce from 'immer';
import React, {useState, useEffect, useRef, useCallback} from 'react';
import {useTranslation} from 'react-i18next';

function TimeSeries({timeseries, dates, chartType, isUniform, isLog}) {
  const {t} = useTranslation();
  const [highlightedDate, setHighlightedDate] = useState('2020-05-03');
  const refs = useRef([]);

  const wrapperRef = useRef();
  const dimensions = useResizeObserver(wrapperRef);

  const getDailyStatistic = useCallback(
    (date, statistic, chartType) => {
      switch (chartType) {
        case 'Cumulative':
          return null;

        default:
          switch (statistic) {
            case 'active':
              return (
                timeseries[date].confirmed -
                timeseries[date].recovered -
                timeseries[date].deceased
              );

            case 'tested':
              return timeseries[date].tested?.samples || 0;

            default:
              return timeseries[date][statistic];
          }
      }
    },
    [timeseries]
  );

  const getDiscreteStatisticArray = useCallback(
    (statistic) => {
      let array = [];
      dates.map(
        (date) => (array = [...array, getDailyStatistic(date, statistic)])
      );
      return array;
    },
    [dates, getDailyStatistic]
  );

  const getCumulativeStatisticArray = (discreteStatisticArray) => {
    return discreteStatisticArray.reduce(function (r, discreteStatisticArray) {
      r.push(((r.length && r[r.length - 1]) || 0) + discreteStatisticArray);
      return r;
    }, []);
  };

  const graphData = useCallback(
    (timeseries) => {
      const {width, height} =
        dimensions || wrapperRef.current.getBoundingClientRect();

      // Margins
      const margin = {top: 15, right: 35, bottom: 25, left: 25};
      const chartRight = width - margin.right;
      const chartBottom = height - margin.bottom;

      const T = dates.length;
      const yBufferTop = 1.2;
      const yBufferBottom = 1.1;

      const dateMin = d3.min(dates);
      const dateMax = d3.max(dates);

      const xScale = d3
        .scaleTime()
        .clamp(true)
        .domain([new Date(dateMin), new Date(dateMax)])
        .range([margin.left, chartRight]);

      // Number of x-axis ticks
      const numTicksX = width < 480 ? 4 : 7;

      const xAxis = (g) =>
        g.attr('class', 'x-axis').call(
          d3
            .axisBottom(xScale)
            .ticks(numTicksX)
            .tickFormat((tick) => {
              return formatTimeseriesTickX(tick);
            })
        );

      const xAxis2 = (g, yScale) => {
        g.attr('class', 'x-axis2')
          .call(d3.axisBottom(xScale).tickValues([]).tickSize(0))
          .select('.domain')
          .style('transform', `translateY(${yScale(0)}px)`);

        if (yScale(0) !== chartBottom) g.select('.domain').attr('opacity', 0.4);
        else g.select('.domain').attr('opacity', 0);
      };

      const yAxis = (g, yScale) =>
        g
          .attr('class', 'y-axis')
          .call(d3.axisRight(yScale).ticks(4, '0~s').tickPadding(4));

      const colors = ['#ff073a', '#007bff', '#28a745', '#6c757d', '#201aa2'];

      const svgArray = [];
      refs.current.forEach((ref) => {
        svgArray.push(d3.select(ref));
      });

      let yScales;
      if (plotTotal) {
        const uniformScaleMin = d3.min(timeseries, (d) =>
          Math.min(d.totalactive, d.totalrecovered, d.totaldeceased)
        );
        const uniformScaleMax = d3.max(timeseries, (d) => d.totalconfirmed);
        const yScaleUniformLinear = d3
          .scaleLinear()
          .clamp(true)
          .domain([uniformScaleMin, Math.max(1, yBufferTop * uniformScaleMax)])
          .nice(4)
          .range([chartBottom, margin.top]);

        const yScaleUniformLog = d3
          .scaleLog()
          .clamp(true)
          .domain([
            Math.max(1, uniformScaleMin),
            Math.max(10, yBufferTop * uniformScaleMax),
          ])
          .nice(4)
          .range([chartBottom, margin.top]);

        yScales = dataTypesTotal.map((type) => {
          const yScaleLinear = d3
            .scaleLinear()
            .clamp(true)
            .domain([
              d3.min(timeseries, (d) => d[type]),
              Math.max(1, yBufferTop * d3.max(timeseries, (d) => d[type])),
            ])
            .nice(4)
            .range([chartBottom, margin.top]);
          const yScaleLog = d3
            .scaleLog()
            .clamp(true)
            .domain([
              Math.max(1, d3.min(statistics[chartType][statistic])),
              Math.max(
                10,
                yBufferTop * d3.max(statistics[chartType][statistic])
              ),
            ])
            .nice(4)
            .range([chartBottom, margin.top]);

        return d3
          .scaleLinear()
          .clamp(true)
          .domain([
            yBufferBottom *
              Math.min(0, d3.min(statistics[chartType][statistic])),
            Math.max(1, yBufferTop * d3.max(statistics[chartType][statistic])),
          ])
          .nice(4)
          .range([chartBottom, margin.top]);
      };

      const yScales = [];
      PRIMARY_STATISTICS.map((statistic) => {
        yScales.push(generateYScale(statistic));
      });

      /* Focus dots */
      const focus = svgArray.map((svg, i) => {
        return svg
          .selectAll('.focus')
          .data([dates])
          .join((enter) =>
            enter.append('circle').attr('cx', (date) => {
              xScale(new Date(date));
            })
          )
          .attr('class', 'focus')
          .attr('fill', colors[i])
          .attr('stroke', colors[i])
          .attr('r', 4);
      });

      function mousemove() {
        const xm = d3.mouse(this)[0];
        const date = xScale.invert(xm);
        const bisectDate = d3.bisector((date) => new Date(date)).left;
        const index = bisectDate(dates, date, 1);
        setHighlightedDate(dates[index]);
      }

      function mouseout() {
        setHighlightedDate(dates[T - 1]);
      }

      /* Begin drawing charts */
      svgArray.forEach((svg, i) => {
        const t = svg.transition().duration(300);
        const color = colors[i];
        const yScale = yScales[i];
        const statistic = PRIMARY_STATISTICS[i];

        /* X axis */
        svg
          .select('.x-axis')
          .style('transform', `translateY(${chartBottom}px)`)
          .transition(t)
          .call(xAxis);
        svg.select('.x-axis2').transition(t).call(xAxis2, yScale);

        /* Y axis */
        svg
          .select('.y-axis')
          .style('transform', `translateX(${chartRight}px)`)
          .transition(t)
          .call(yAxis, yScale);

        /* Path dots */
        svg
          .selectAll('.dot')
          .data(dates)
          .join((enter) =>
            enter
              .append('circle')
              .attr('cy', chartBottom)
              .attr('cx', (date) => xScale(new Date(date)))
          )
          .attr('class', 'dot')
          .attr('fill', color)
          .attr('stroke', color)
          .attr('r', 2)
          .transition(t)
          .attr('cx', (date) => xScale(new Date(date)))
          .attr('cy', (date, index) =>
            yScale(statistics[chartType][statistic][index])
          );

        // if (!isNaN(timeseries[dates[T - 1]][statistic]))
        //   focus[i]
        //     .transition(t)
        //     .attr('cx', (date) => xScale(new Date(date)))
        //     .attr('cy', (date, index) =>
        //       yScale(statistics[chartType][statistic][index])
        //     )
        //     .attr('opacity', 1);
        // else focus[i].transition(t).attr('opacity', 0);

        if (chartType === 'cumulative') {
          /* TOTAL TRENDS */
          svg.selectAll('.stem').remove();

          const path = svg
            .selectAll('.trend')
            .data([dates])
            .join('path')
            .attr('class', 'trend')
            .attr('fill', 'none')
            .attr('stroke', color + '99')
            .attr('stroke-width', 4);

          // HACK
          // Path interpolation is non-trivial. Ideally, a custom path tween
          // function should be defined which takes care that old path dots
          // transition synchronously along with the path transition. This hack
          // simulates that behaviour.
          if (path.attr('d')) {
            const n = path.node().getTotalLength();
            const p = path.node().getPointAtLength(n);
            // Append points at end of path for better interpolation
            path.attr(
              'd',
              () => path.attr('d') + `L${p.x},${p.y}`.repeat(3 * T)
            );
          }

          path
            .transition(t)
            .attr('opacity', chartType === 'cumulative' ? 1 : 0)
            .attr(
              'd',
              d3
                .line()
                .x((date) => {
                  xScale(new Date(date));
                })
                .y((date, index) => {
                  yScale(statistics[chartType][statistic][index]);
                })
                .curve(d3.curveMonotoneX)
            );
        } else {
          /* DAILY TRENDS */
          svg.selectAll('.trend').remove();

          svg
            .selectAll('.stem')
            .data(dates, (date) => date)
            .join((enter) =>
              enter
                .append('line')
                .attr('x1', (date) => xScale(new Date(date)))
                .attr('y1', chartBottom)
                .attr('x2', (date) => xScale(new Date(date)))
                .attr('y2', chartBottom)
            )
            .attr('class', 'stem')
            .style('stroke', color + '99')
            .style('stroke-width', 4)
            .transition(t)
            .attr('x1', (date) => xScale(new Date(date)))
            .attr('y1', yScale(0))
            .attr('x2', (date) => xScale(new Date(date)))
            .attr('y2', (date, index) =>
              yScale(statistics[chartType][statistic][index])
            );
        }

        svg
          .on('mousemove', mousemove)
          .on('touchmove', mousemove)
          .on('mouseout', mouseout)
          .on('touchend', mouseout);
      });
    },
    [chartType, dimensions, isUniform, isLog, dates, getDiscreteStatisticArray]
  );

  useEffect(() => {
    graphData(timeseries);
  }, [timeseries, graphData, dates]);

  return (
    <React.Fragment>
      <div className="TimeSeries">
        {PRIMARY_STATISTICS.map((statistic, index) => (
          <div
            key={statistic}
            className={classnames('svg-parent', `is-${statistic}`)}
            ref={wrapperRef}
          >
            <div className={classnames('stats', `is-${statistic}`)}>
              <h5 className="title">{capitalize(t(statistic))}</h5>
              <h5 className="">{`${highlightedDate}`}</h5>
              <div className="stats-bottom">
                <h2>
                  {formatNumber(
                    getDailyStatistic(highlightedDate, statistic, chartType)
                  )}
                </h2>
                <h6></h6>
              </div>
            </div>
            <svg
              ref={(el) => {
                refs.current[index] = el;
              }}
              preserveAspectRatio="xMidYMid meet"
            >
              <g className="x-axis" />
              <g className="x-axis2" />
              <g className="y-axis" />
            </svg>
          </div>
        ))}
      </div>
    </React.Fragment>
  );
}

const isEqual = (prevProps, currProps) => {
  if (!equal(currProps.dates.length, prevProps.dates.length)) {
    return false;
  }
  if (!equal(currProps.chartType, prevProps.chartType)) {
    return false;
  }
  if (!equal(currProps.isUniform, prevProps.isUniform)) {
    return false;
  }
  if (!equal(currProps.isLog, prevProps.isLog)) {
    return false;
  }
  if (!equal(currProps.stateCode, prevProps.stateCode)) {
    return false;
  }
  return true;
};

export default React.memo(TimeSeries, isEqual);
