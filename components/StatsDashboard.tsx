import React from 'react';
import { Subject } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface StatsDashboardProps {
  subjects: Subject[];
  language?: 'en' | 'zh';
}

const DASHBOARD_TEXT = {
  en: {
    totalEnrollment: 'Total Enrollment',
    consented: 'Consented',
    excluded: 'Excluded',
    dataCompleteness: 'Data Completeness',
    recordsComplete: 'records complete',
    riskFlags: 'Clinical Risk & Quality Flags',
    missingConsent: 'Missing Consent',
    surgeryHx: 'Surgery Hx',
    bilateral: 'Bilateral',
    dxDist: 'Diagnosis Distribution (Top 6)',
    demoSummary: 'Demo Summary',
    cohortComp: 'Cohort Composition',
    unknown: 'Unknown',
    unspecified: 'Unspecified'
  },
  zh: {
    totalEnrollment: '总入组人数',
    consented: '已签署同意',
    excluded: '已排除',
    dataCompleteness: '数据完整性',
    recordsComplete: '条记录完整',
    riskFlags: '临床风险与质量标记',
    missingConsent: '缺少同意',
    surgeryHx: '手术史',
    bilateral: '双侧',
    dxDist: '诊断分布（前6）',
    demoSummary: '分布摘要',
    cohortComp: '队列构成',
    unknown: '未知',
    unspecified: '未注明'
  }
};

export const StatsDashboard: React.FC<StatsDashboardProps> = ({ subjects, language = 'en' }) => {
  if (subjects.length === 0) return null;
  const t = DASHBOARD_TEXT[language];

  const totalSubjects = subjects.length;
  const consentedCount = subjects.filter((s) => s.consent_status).length;
  const excludedCount = subjects.filter((s) => s.exclusion_flag).length;
  const consentRate = ((consentedCount / totalSubjects) * 100).toFixed(1);
  const missingConsentCount = totalSubjects - consentedCount;
  const surgeryHistoryCount = subjects.filter((s) => (s.surgery_history || '').trim().length > 0 && (s.surgery_history || '').toLowerCase() !== 'none').length;
  const bilateralAffectedCount = subjects.filter((s) => s.affected_side === 'Bilateral').length;

  const requiredCompletenessFields: Array<keyof Subject> = [
    'height_cm',
    'mass_kg',
    'bmi',
    'sex',
    'cohort_group'
  ];

  const completeRecords = subjects.filter((subject) => {
    return requiredCompletenessFields.every((key) => {
      const value = subject[key];
      if (value === null || value === undefined) return false;
      if (typeof value === 'string') return value.trim().length > 0;
      return true;
    });
  }).length;
  const completenessRate = ((completeRecords / totalSubjects) * 100).toFixed(1);

  const groupCounts: Record<string, number> = {};
  subjects.forEach((s) => {
    const g = s.cohort_group || t.unknown;
    groupCounts[g] = (groupCounts[g] || 0) + 1;
  });

  const cohortData = Object.entries(groupCounts).map(([name, value]) => ({ name, value }));

  const diagnosisCounts: Record<string, number> = {};
  subjects.forEach((s) => {
    const dx = s.diagnosis?.trim() || t.unspecified;
    diagnosisCounts[dx] = (diagnosisCounts[dx] || 0) + 1;
  });
  const diagnosisData = Object.entries(diagnosisCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const diagnosisDemoData = diagnosisData.map((item) => ({
    ...item,
    pct: ((item.count / totalSubjects) * 100).toFixed(1)
  }));

  const PIE_COLORS = ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#6b7280'];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
      <div className="bg-white overflow-hidden shadow rounded-lg p-5 lg:col-span-3 min-h-[150px] flex flex-col items-center justify-center text-center">
        <dt className="text-sm font-medium text-gray-500">{t.totalEnrollment}</dt>
        <dd className="text-3xl font-semibold text-gray-900 mt-2">{totalSubjects}</dd>
        <div className="mt-3 text-xs text-gray-500 space-y-1">
          <div>{t.consented}: {consentedCount} ({consentRate}%)</div>
          <div>{t.excluded}: {excludedCount}</div>
        </div>
      </div>
      
      <div className="bg-white overflow-hidden shadow rounded-lg p-5 lg:col-span-3 min-h-[150px] flex flex-col items-center justify-center text-center">
        <dt className="text-sm font-medium text-gray-500">{t.dataCompleteness}</dt>
        <dd className="text-3xl font-semibold text-gray-900 mt-2">{completenessRate}%</dd>
        <dd className="text-xs text-gray-400 mt-2">{completeRecords}/{totalSubjects} {t.recordsComplete}</dd>
      </div>

      <div className="bg-white overflow-hidden shadow rounded-lg p-5 lg:col-span-6 min-h-[150px]">
        <dt className="text-sm font-medium text-gray-500 text-center">{t.riskFlags}</dt>
        <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
          <div className="rounded-md border border-gray-200 px-2 py-2 text-center">
            <div className="text-[11px] text-gray-500">{t.missingConsent}</div>
            <div className="text-lg font-semibold text-gray-900 leading-tight">{missingConsentCount}</div>
          </div>
          <div className="rounded-md border border-gray-200 px-2 py-2 text-center">
            <div className="text-[11px] text-gray-500">{t.excluded}</div>
            <div className="text-lg font-semibold text-gray-900 leading-tight">{excludedCount}</div>
          </div>
          <div className="rounded-md border border-gray-200 px-2 py-2 text-center">
            <div className="text-[11px] text-gray-500">{t.surgeryHx}</div>
            <div className="text-lg font-semibold text-gray-900 leading-tight">{surgeryHistoryCount}</div>
          </div>
          <div className="rounded-md border border-gray-200 px-2 py-2 text-center">
            <div className="text-[11px] text-gray-500">{t.bilateral}</div>
            <div className="text-lg font-semibold text-gray-900 leading-tight">{bilateralAffectedCount}</div>
          </div>
        </div>
      </div>

      <div className="bg-white overflow-hidden shadow rounded-lg p-3 lg:col-span-6 h-[280px] flex flex-col">
        <span className="text-xs font-medium text-gray-500 mb-2 ml-2">{t.dxDist}</span>
        <div className="w-full h-36">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={diagnosisData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" fontSize={10} interval={0} angle={-20} textAnchor="end" height={45} />
              <YAxis allowDecimals={false} fontSize={10} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{fontSize: '12px'}} />
              <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 px-2 pb-1 flex-1 overflow-auto">
          <div className="text-[11px] font-medium text-gray-500 mb-1">{t.demoSummary}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 pr-1">
            {diagnosisDemoData.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-xs text-gray-600">
                <span className="truncate pr-2">{item.name}</span>
                <span>{item.count} ({item.pct}%)</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white overflow-hidden shadow rounded-lg p-3 lg:col-span-6 h-[280px] flex flex-col">
        <span className="text-xs font-medium text-gray-500 mb-2 ml-2">{t.cohortComp}</span>
        <div className="w-full h-36">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={cohortData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={72}>
                {cohortData.map((entry, index) => (
                  <Cell key={`pie-${entry.name}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ fontSize: '12px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 px-2 pb-1 flex-1 overflow-auto text-xs text-gray-600 space-y-1">
          {cohortData.map((item) => (
            <div key={item.name} className="flex items-center justify-between rounded border border-gray-100 px-2 py-1">
              <span className="truncate pr-2">{item.name}</span>
              <span>{item.value} ({((item.value / totalSubjects) * 100).toFixed(1)}%)</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
