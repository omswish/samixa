'use client';

import React from 'react';
import {
  AreaChart,
  Area,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis
} from 'recharts';

interface UptimeChartProps {
  history: number[];
  color?: string;
  secondaryHistory?: number[];
  secondaryColor?: string;
  threshold?: number;
  thresholdColor?: string;
  fixedDomain?: [number, number];
  hideNoDataText?: boolean;
  strokeWidth?: number;
  variant?: 'area' | 'perfstack';
}

export default function UptimeChart({
  history,
  color = '#8d6e63',
  secondaryHistory,
  secondaryColor = '#1565c0',
  threshold,
  thresholdColor = 'rgba(198, 40, 40, 0.32)',
  fixedDomain,
  hideNoDataText = false,
  strokeWidth = 2,
  variant = 'area'
}: UptimeChartProps) {
  const primary = history || [];
  const secondary = secondaryHistory || [];
  const maxLength = Math.max(primary.length, secondary.length);
  const data = Array.from({ length: maxLength }, (_, idx) => ({
    name: idx,
    value: primary[idx],
    secondaryValue: secondary[idx]
  }));
  const gradientId = `colorGrad-${color.replace(/[^a-z0-9]/gi, '')}-${strokeWidth}`;
  const secondaryGradientId = `colorGrad-${secondaryColor.replace(/[^a-z0-9]/gi, '')}-secondary-${strokeWidth}`;

  if (!data || data.length === 0) {
    return hideNoDataText
      ? <div style={{ width: '100%', height: '100%' }} />
      : <div className="h-full w-full flex items-center justify-center text-xs opacity-50">No Data</div>;
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        {variant === 'perfstack' ? (
          <LineChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(125, 135, 148, 0.22)" strokeDasharray="2 2" vertical={false} />
            <XAxis dataKey="name" hide />
            <YAxis
              domain={fixedDomain ?? [0, 100]}
              axisLine={false}
              tickLine={false}
              width={26}
              tick={{ fill: 'rgba(93, 64, 55, 0.68)', fontSize: 9, fontWeight: 700 }}
              ticks={[0, 20, 40, 60, 80, 100]}
            />
            {threshold !== undefined ? (
              <ReferenceLine y={threshold} stroke={thresholdColor} strokeDasharray="3 3" ifOverflow="extendDomain" />
            ) : null}
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={strokeWidth}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
            {secondary.length > 0 ? (
              <Line
                type="monotone"
                dataKey="secondaryValue"
                stroke={secondaryColor}
                strokeWidth={strokeWidth}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            ) : null}
          </LineChart>
        ) : (
          <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
            <YAxis domain={fixedDomain ?? ['auto', 'auto']} hide />
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.4}/>
                <stop offset="95%" stopColor={color} stopOpacity={0.0}/>
              </linearGradient>
              <linearGradient id={secondaryGradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={secondaryColor} stopOpacity={0.22}/>
                <stop offset="95%" stopColor={secondaryColor} stopOpacity={0.0}/>
              </linearGradient>
            </defs>
            {threshold !== undefined ? (
              <ReferenceLine y={threshold} stroke={thresholdColor} strokeDasharray="3 3" ifOverflow="extendDomain" />
            ) : null}
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={strokeWidth}
              fillOpacity={1}
              fill={`url(#${gradientId})`}
              isAnimationActive={false}
            />
            {secondary.length > 0 ? (
              <Area
                type="monotone"
                dataKey="secondaryValue"
                stroke={secondaryColor}
                strokeWidth={strokeWidth}
                fillOpacity={1}
                fill={`url(#${secondaryGradientId})`}
                isAnimationActive={false}
              />
            ) : null}
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
