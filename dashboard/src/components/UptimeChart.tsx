'use client';

import React from 'react';
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';

interface UptimeChartProps {
  history: number[];
  color?: string;
}

export default function UptimeChart({ history, color = '#8d6e63' }: UptimeChartProps) {
  // Format history data for Recharts
  const data = history.map((val, idx) => ({ name: idx, value: val }));

  if (!data || data.length === 0) {
    return <div className="h-full w-full flex items-center justify-center text-xs opacity-50">No Data</div>;
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <YAxis domain={['auto', 'auto']} hide />
          <defs>
            <linearGradient id={`colorGrad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.4}/>
              <stop offset="95%" stopColor={color} stopOpacity={0.0}/>
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fillOpacity={1}
            fill={`url(#colorGrad-${color.replace('#', '')})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
