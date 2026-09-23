import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Line, Path, Stop, Text as SvgText } from 'react-native-svg';

import type { ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/useTheme';

// A real line chart for the 30-day revenue trend, mirroring admin.html's
// own SVG chart (an area fill under a stroked line, a faint grid, the
// current total called out) - drawn with react-native-svg instead of
// hand-rolled path strings the web version builds in plain JS, same data.
export default function RevenueLineChart({ data, height = 160 }: { data: { date: string; amountUsd: number }[]; height?: number }) {
  const { colors } = useTheme();
  const width = 320;
  const paddingLeft = 8;
  const paddingRight = 8;
  const paddingTop = 16;
  const paddingBottom = 22;
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;

  const { linePath, areaPath, points, maxValue } = useMemo(() => {
    const max = Math.max(1, ...data.map((d) => d.amountUsd));
    const step = data.length > 1 ? plotWidth / (data.length - 1) : 0;
    const pts = data.map((d, i) => ({
      x: paddingLeft + step * i,
      y: paddingTop + plotHeight - (d.amountUsd / max) * plotHeight,
      amountUsd: d.amountUsd,
      date: d.date,
    }));
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const area = pts.length
      ? `${line} L${pts[pts.length - 1].x.toFixed(1)},${(paddingTop + plotHeight).toFixed(1)} L${pts[0].x.toFixed(1)},${(paddingTop + plotHeight).toFixed(1)} Z`
      : '';
    return { linePath: line, areaPath: area, points: pts, maxValue: max };
  }, [data, plotWidth, plotHeight]);

  const gridLines = [0, 0.5, 1];

  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          <LinearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.primaryRed} stopOpacity={0.35} />
            <Stop offset="1" stopColor={colors.primaryRed} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {gridLines.map((g, i) => {
          const y = paddingTop + plotHeight * g;
          return <Line key={i} x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke={colors.border} strokeWidth={1} />;
        })}
        {areaPath ? <Path d={areaPath} fill="url(#revenueFill)" /> : null}
        {linePath ? <Path d={linePath} stroke={colors.primaryRed} strokeWidth={2} fill="none" /> : null}
        {points.length > 0 ? <Circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={3.5} fill={colors.primaryRed} /> : null}
        <SvgText x={paddingLeft} y={height - 6} fontSize={9} fill={colors.textFaint}>
          {data[0]?.date.slice(5) || ''}
        </SvgText>
        <SvgText x={width - paddingRight} y={height - 6} fontSize={9} fill={colors.textFaint} textAnchor="end">
          {data[data.length - 1]?.date.slice(5) || ''}
        </SvgText>
        <SvgText x={paddingLeft} y={paddingTop - 4} fontSize={9} fill={colors.textFaint}>
          ${maxValue.toLocaleString()}
        </SvgText>
      </Svg>
    </View>
  );
}
