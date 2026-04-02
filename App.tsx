import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Subject, User, StudyProtocol, INITIAL_SUBJECT_STATE, Sex, Handedness, AffectedSide } from './types';
import { authService } from './services/authService';
import { dataService } from './services/dataService';
import { studyProtocolService } from './services/studyProtocolService';
import { SubjectForm } from './components/SubjectForm';
import { StatsDashboard } from './components/StatsDashboard';
import { Button } from './components/Button';
import { LoginModal } from './components/LoginModal';
import { UserManagementModal } from './components/UserManagementModal';
import { StudyProtocolPage } from './components/StudyProtocolPage';
import { 
  Plus, 
  Upload, 
  Download, 
  Languages,
  Trash2, 
  Edit, 
  Activity,
  FileText,
  Search,
  AlertCircle,
  Shield,
  Eye,
  User as UserIcon,
  LogOut,
  LogIn,
  Settings,
  Database,
  RefreshCcw,
  FileSpreadsheet,
  FileUp,
  BookOpenText,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';

// Comprehensive CSV Headers - Reordered to prioritize Identity
const CSV_HEADERS = [
  "subject_id",
  "real_name",      // Added prominently
  "contact_info",   // Added prominently
  "site_id",
  "cohort_group",
  "enrollment_date",
  "name_code",
  "sex",
  "dob",
  "handedness",
  "leg_dominance",
  "height_cm",
  "mass_kg",
  "bmi",
  "shoe_size_eu",
  "trunk_length_cm",
  "limb_length_l_cm",
  "limb_length_r_cm",
  "thigh_length_l_cm",
  "thigh_length_r_cm",
  "shank_length_l_cm",
  "shank_length_r_cm",
  "foot_length_l_cm",
  "foot_length_r_cm",
  "knee_width_l_cm",
  "knee_width_r_cm",
  "ankle_width_l_cm",
  "ankle_width_r_cm",
  "diagnosis",
  "affected_side",
  "severity_scale",
  "surgery_history",
  "medications",
  "consent_status",
  "irb_protocol",
  "assessor",
  "exclusion_flag",
  "notes"
];

const NUMERIC_MEASURES: Array<{ key: keyof Subject; label: string }> = [
  { key: 'height_cm', label: 'Height (cm)' },
  { key: 'mass_kg', label: 'Mass (kg)' },
  { key: 'bmi', label: 'BMI' },
  { key: 'shoe_size_eu', label: 'Shoe Size (EU)' },
  { key: 'trunk_length_cm', label: 'Trunk Length (cm)' },
  { key: 'limb_length_l_cm', label: 'Limb Length Left (cm)' },
  { key: 'limb_length_r_cm', label: 'Limb Length Right (cm)' },
  { key: 'thigh_length_l_cm', label: 'Thigh Length Left (cm)' },
  { key: 'thigh_length_r_cm', label: 'Thigh Length Right (cm)' },
  { key: 'shank_length_l_cm', label: 'Shank Length Left (cm)' },
  { key: 'shank_length_r_cm', label: 'Shank Length Right (cm)' },
  { key: 'foot_length_l_cm', label: 'Foot Length Left (cm)' },
  { key: 'foot_length_r_cm', label: 'Foot Length Right (cm)' },
  { key: 'knee_width_l_cm', label: 'Knee Width Left (cm)' },
  { key: 'knee_width_r_cm', label: 'Knee Width Right (cm)' },
  { key: 'ankle_width_l_cm', label: 'Ankle Width Left (cm)' },
  { key: 'ankle_width_r_cm', label: 'Ankle Width Right (cm)' }
];

const MEASURE_LABEL_ZH: Record<string, string> = {
  'Height (cm)': '身高 (cm)',
  'Mass (kg)': '体重 (kg)',
  'BMI': '体质指数 BMI',
  'Shoe Size (EU)': '鞋码 (EU)',
  'Trunk Length (cm)': '躯干长度 (cm)',
  'Limb Length Left (cm)': '肢体长度-左 (cm)',
  'Limb Length Right (cm)': '肢体长度-右 (cm)',
  'Thigh Length Left (cm)': '大腿长度-左 (cm)',
  'Thigh Length Right (cm)': '大腿长度-右 (cm)',
  'Shank Length Left (cm)': '小腿长度-左 (cm)',
  'Shank Length Right (cm)': '小腿长度-右 (cm)',
  'Foot Length Left (cm)': '足长-左 (cm)',
  'Foot Length Right (cm)': '足长-右 (cm)',
  'Knee Width Left (cm)': '膝宽-左 (cm)',
  'Knee Width Right (cm)': '膝宽-右 (cm)',
  'Ankle Width Left (cm)': '踝宽-左 (cm)',
  'Ankle Width Right (cm)': '踝宽-右 (cm)'
};

const quantile = (sortedValues: number[], p: number): number => {
  const n = sortedValues.length;
  if (n === 0) return NaN;
  if (n === 1) return sortedValues[0];

  const clamped = Math.min(1, Math.max(0, p));
  const index = (n - 1) * clamped;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];

  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
};

const quartiles = (sortedValues: number[]): { q1: number; q3: number } => ({
  q1: quantile(sortedValues, 0.25),
  q3: quantile(sortedValues, 0.75)
});

const normalizeText = (value: unknown): string => String(value || '').trim().toLowerCase();

const getSelectionKey = (subject: Subject): string => String(subject.id || subject.subject_id || '');

const isSessionError = (message: string) => {
  const text = String(message || '').toLowerCase();
  return text.includes('session expired') || text.includes('missing or invalid authorization token');
};

type AnalysisScope = 'cohort' | 'feature';
type FeatureField = 'diagnosis' | 'sex' | 'affected_side';
type PairKey = 'subject_id' | 'name_code';
type AnalysisMode = 'independent-2' | 'paired-2' | 'anova' | 'repeated';

interface AnalysisRow {
  measure: string;
  n: number;
  normalityP: number;
  testName: string;
  statisticLabel: string;
  statisticValue: number;
  pValue: number;
  df: string;
  power: number;
  note?: string;
}

type AppLanguage = 'en' | 'zh';
type AppPage = 'subjects' | 'protocols';

const UI_TEXT: Record<AppLanguage, Record<string, string>> = {
  en: {
    clinicalDataManager: 'Baseline Data Manager by Hippony Lab',
    signIn: 'Sign In',
    signOut: 'Sign Out',
    manageUsers: 'Manage Users',
    backupDb: 'Full DB Backup (Download)',
    restoreDb: 'Restore DB (Overwrite)',
    downloadTemplate: 'Download CSV Template',
    importCsv: 'Import CSV Data',
    exportVisible: 'Export Visible View',
    export: 'Export',
    exportSelectedRows: 'Export Selected Rows',
    selectedCsv: 'Selected CSV',
    add: 'Add',
    searchDeleted: 'Search Deleted...',
    searchActive: 'Search Active...',
    backToActive: 'Back to Active Data',
    recycleBin: 'Recycle Bin',
    all: 'All',
    cohort: 'Cohort',
    diagnosis: 'Diagnosis',
    sex: 'Sex',
    affectedSide: 'Affected Side',
    selectByCriteria: 'Select by Criteria',
    clearSelection: 'Clear Selection',
    downloadSelectedStats: 'Download Selected Stats',
    downloadSelectedRawData: 'Download selected Raw Data',
    selected: 'Selected',
    selectedStats: 'Selected Subject Statistics',
    subjects: 'subjects',
    inferentialModule: 'Inferential Statistics Module',
    groups: 'Groups',
    downloadResultsCsv: 'Download Results CSV',
    scope: 'Scope',
    featureField: 'Feature Field',
    cohortFilter: 'Cohort Filter',
    pairKey: 'Pair Key',
    compareCohorts: 'Compare cohorts',
    compareFeaturesWithinCohort: 'Compare features within cohort',
    subjectRecords: 'Subject Records',
    studyProtocols: 'Study Protocols',
    languageToggleTitle: 'Switch language',
    recycleWarningPrefix: 'You are viewing the',
    recycleWarningCore: 'Recycle Bin',
    recycleWarningSuffix: 'Items here are hidden from the main study. Restore them to edit, or delete them permanently.',
    identityContact: 'Identity & Contact',
    deIdentifiedCode: 'De-Identified Code',
    cohortDx: 'Cohort / Dx',
    demographics: 'Demographics',
    status: 'Status',
    version: 'Version',
    actions: 'Actions',
    noRecordsFound: 'No records found',
    inTrash: 'in trash',
    unknownName: 'Unknown Name',
    noContactInfo: 'No contact info',
    id: 'ID',
    pending: 'Pending',
    healthy: 'Healthy',
    dob: 'DOB',
    na: 'N/A',
    excluded: 'Excluded',
    consented: 'Consented',
    noConsent: 'No Consent',
    by: 'by',
    system: 'System',
    showing: 'Showing',
    records: 'records',
    confirmMoveRecycle: 'Move this record to the Recycle Bin?',
    confirmHardDelete: 'PERMANENTLY DELETE? This cannot be undone.',
    confirmRestoreDb: 'WARNING: Restoring a database will OVERWRITE all current data. Continue?',
    restoreSuccess: 'Database restored successfully. Page will reload.',
    restoreFailed: 'Restore failed:',
    importComplete: 'Import complete.',
    recordsAdded: 'records added.',
    errors: 'Errors',
    importFailed: 'Import Failed:',
    restore: 'Restore',
    permanentlyDelete: 'Permanently Delete',
    moveToRecycleBin: 'Move to Recycle Bin',
    male: 'Male',
    female: 'Female',
    intersex: 'Intersex',
    other: 'Other',
    sideRight: 'Right',
    sideLeft: 'Left',
    sideBilateral: 'Bilateral',
    sideNone: 'None',
    admin: 'Admin',
    researcher: 'Researcher',
    visitor: 'Visitor',
    measure: 'Measure',
    nUpper: 'N',
    mean: 'Mean',
    sd: 'SD',
    iqr: 'IQR',
    range95Low: '95% Range Low',
    range95High: '95% Range High',
    normalityP: 'Normality P',
    test: 'Test',
    statistic: 'Statistic',
    df: 'DF',
    pUpper: 'P',
    power: 'Power'
  },
  zh: {
    clinicalDataManager: 'Baseline Data Manager by Hippony Lab',
    signIn: '登录',
    signOut: '退出登录',
    manageUsers: '用户管理',
    backupDb: '完整数据库备份（下载）',
    restoreDb: '恢复数据库（覆盖）',
    downloadTemplate: '下载 CSV 模板',
    importCsv: '导入 CSV 数据',
    exportVisible: '导出当前视图',
    export: '导出',
    exportSelectedRows: '导出已选行',
    selectedCsv: '已选 CSV',
    add: '新增',
    searchDeleted: '搜索已删除数据...',
    searchActive: '搜索有效数据...',
    backToActive: '返回有效数据',
    recycleBin: '回收站',
    all: '全部',
    cohort: '队列',
    diagnosis: '诊断',
    sex: '性别',
    affectedSide: '患侧',
    selectByCriteria: '按条件选择',
    clearSelection: '清除选择',
    downloadSelectedStats: '下载已选统计',
    downloadSelectedRawData: '下载已选原始数据',
    selected: '已选',
    selectedStats: '已选受试者统计',
    subjects: '名受试者',
    inferentialModule: '推断统计模块',
    groups: '分组',
    downloadResultsCsv: '下载结果 CSV',
    scope: '比较范围',
    featureField: '特征字段',
    cohortFilter: '队列筛选',
    pairKey: '配对键',
    compareCohorts: '比较不同队列',
    compareFeaturesWithinCohort: '比较同队列内特征',
    subjectRecords: '受试者记录',
    studyProtocols: '研究方案',
    languageToggleTitle: '切换语言',
    recycleWarningPrefix: '当前正在查看',
    recycleWarningCore: '回收站',
    recycleWarningSuffix: '此处数据已从主研究中隐藏。可恢复后编辑，或永久删除。',
    identityContact: '身份与联系方式',
    deIdentifiedCode: '去标识编码',
    cohortDx: '队列 / 诊断',
    demographics: '人口学',
    status: '状态',
    version: '版本',
    actions: '操作',
    noRecordsFound: '未找到记录',
    inTrash: '（回收站）',
    unknownName: '未知姓名',
    noContactInfo: '无联系方式',
    id: '编号',
    pending: '待定',
    healthy: '健康',
    dob: '出生日期',
    na: '无',
    excluded: '已排除',
    consented: '已同意',
    noConsent: '未同意',
    by: '操作者',
    system: '系统',
    showing: '显示',
    records: '条记录',
    confirmMoveRecycle: '将此记录移入回收站？',
    confirmHardDelete: '确认永久删除？该操作无法撤销。',
    confirmRestoreDb: '警告：恢复数据库将覆盖当前全部数据，是否继续？',
    restoreSuccess: '数据库恢复成功，页面将刷新。',
    restoreFailed: '恢复失败：',
    importComplete: '导入完成。',
    recordsAdded: '条记录已添加。',
    errors: '错误',
    importFailed: '导入失败：',
    restore: '恢复',
    permanentlyDelete: '永久删除',
    moveToRecycleBin: '移入回收站',
    male: '男',
    female: '女',
    intersex: '双性',
    other: '其他',
    sideRight: '右侧',
    sideLeft: '左侧',
    sideBilateral: '双侧',
    sideNone: '无',
    admin: '管理员',
    researcher: '研究者',
    visitor: '访客',
    measure: '指标',
    nUpper: '样本量',
    mean: '均值',
    sd: '标准差',
    iqr: '四分位距',
    range95Low: '95%区间下限',
    range95High: '95%区间上限',
    normalityP: '正态性P值',
    test: '检验方法',
    statistic: '统计量',
    df: '自由度',
    pUpper: 'P值',
    power: '检验效能'
  }
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const erf = (x: number): number => {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-absX * absX);
  return sign * y;
};

const normalCdf = (z: number): number => 0.5 * (1 + erf(z / Math.sqrt(2)));

const mean = (values: number[]): number => values.reduce((s, v) => s + v, 0) / values.length;

const sampleVariance = (values: number[]): number => {
  if (values.length < 2) return 0;
  const m = mean(values);
  return values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
};

const sampleStd = (values: number[]): number => Math.sqrt(sampleVariance(values));

const rankValues = (values: number[]): number[] => {
  const sorted = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array(values.length).fill(0);
  let idx = 0;
  while (idx < sorted.length) {
    let end = idx;
    while (end + 1 < sorted.length && sorted[end + 1].v === sorted[idx].v) end++;
    const avgRank = (idx + end + 2) / 2;
    for (let j = idx; j <= end; j++) {
      ranks[sorted[j].i] = avgRank;
    }
    idx = end + 1;
  }
  return ranks;
};

const shuffle = <T,>(arr: T[]): T[] => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const jarqueBeraNormality = (values: number[]): { p: number; isNormal: boolean } => {
  const n = values.length;
  if (n < 8) return { p: 1, isNormal: true };

  const m = mean(values);
  const m2 = values.reduce((s, v) => s + (v - m) ** 2, 0) / n;
  if (m2 === 0) return { p: 1, isNormal: true };

  const m3 = values.reduce((s, v) => s + (v - m) ** 3, 0) / n;
  const m4 = values.reduce((s, v) => s + (v - m) ** 4, 0) / n;
  const skew = m3 / Math.pow(m2, 1.5);
  const kurt = m4 / (m2 * m2);

  const jb = (n / 6) * (skew ** 2 + ((kurt - 3) ** 2) / 4);
  const z = (Math.cbrt(jb / 2) - (1 - 2 / 9)) / Math.sqrt(2 / 9);
  const cdfApprox = normalCdf(z);
  const p = clamp(1 - cdfApprox, 0, 1);
  return { p, isNormal: p > 0.05 };
};

const approxPowerFromEffect = (effect: number, nEff: number): number => {
  if (!Number.isFinite(effect) || !Number.isFinite(nEff) || nEff <= 0) return NaN;
  const zCrit = 1.96;
  const ncp = Math.abs(effect) * Math.sqrt(nEff);
  const power = 1 - normalCdf(zCrit - ncp) + normalCdf(-zCrit - ncp);
  return clamp(power, 0, 1);
};

const independentTTest = (a: number[], b: number[], permutations = 500) => {
  const n1 = a.length;
  const n2 = b.length;
  const m1 = mean(a);
  const m2 = mean(b);
  const v1 = sampleVariance(a);
  const v2 = sampleVariance(b);
  const se = Math.sqrt(v1 / n1 + v2 / n2);
  const t = se === 0 ? 0 : (m1 - m2) / se;
  const dfNum = (v1 / n1 + v2 / n2) ** 2;
  const dfDen = ((v1 / n1) ** 2) / (n1 - 1) + ((v2 / n2) ** 2) / (n2 - 1);
  const df = dfDen === 0 ? n1 + n2 - 2 : dfNum / dfDen;

  const combined = [...a, ...b];
  let extreme = 0;
  for (let i = 0; i < permutations; i++) {
    const sh = shuffle(combined);
    const pa = sh.slice(0, n1);
    const pb = sh.slice(n1);
    const pSe = Math.sqrt(sampleVariance(pa) / n1 + sampleVariance(pb) / n2);
    const pt = pSe === 0 ? 0 : (mean(pa) - mean(pb)) / pSe;
    if (Math.abs(pt) >= Math.abs(t)) extreme++;
  }
  const p = (extreme + 1) / (permutations + 1);

  const pooled = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / Math.max(1, n1 + n2 - 2));
  const d = pooled === 0 ? 0 : (m1 - m2) / pooled;
  const power = approxPowerFromEffect(d, (n1 * n2) / (n1 + n2));
  return { t, p, df, power };
};

const mannWhitneyUTest = (a: number[], b: number[], permutations = 500) => {
  const n1 = a.length;
  const n2 = b.length;
  const combined = [...a, ...b];
  const ranks = rankValues(combined);
  const r1 = ranks.slice(0, n1).reduce((s, v) => s + v, 0);
  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const mu = (n1 * n2) / 2;
  const obs = Math.abs(u1 - mu);

  let extreme = 0;
  for (let i = 0; i < permutations; i++) {
    const sh = shuffle(combined);
    const pr = rankValues(sh);
    const pr1 = pr.slice(0, n1).reduce((s, v) => s + v, 0);
    const pu1 = pr1 - (n1 * (n1 + 1)) / 2;
    if (Math.abs(pu1 - mu) >= obs) extreme++;
  }
  const p = (extreme + 1) / (permutations + 1);
  return { u: u1, p };
};

const pairedTTest = (pairs: Array<[number, number]>, permutations = 500) => {
  const diffs = pairs.map(([a, b]) => a - b);
  const n = diffs.length;
  const m = mean(diffs);
  const sd = sampleStd(diffs);
  const t = sd === 0 ? 0 : m / (sd / Math.sqrt(n));

  let extreme = 0;
  for (let i = 0; i < permutations; i++) {
    const perm = diffs.map((d) => (Math.random() < 0.5 ? d : -d));
    const pm = mean(perm);
    const psd = sampleStd(perm);
    const pt = psd === 0 ? 0 : pm / (psd / Math.sqrt(n));
    if (Math.abs(pt) >= Math.abs(t)) extreme++;
  }
  const p = (extreme + 1) / (permutations + 1);
  const dz = sd === 0 ? 0 : m / sd;
  const power = approxPowerFromEffect(dz, n);
  return { t, p, df: n - 1, power, diffs };
};

const wilcoxonSignedRankTest = (pairs: Array<[number, number]>, permutations = 500) => {
  const diffs = pairs.map(([a, b]) => a - b).filter((d) => d !== 0);
  const absDiffs = diffs.map((d) => Math.abs(d));
  const ranks = rankValues(absDiffs);
  const wPlus = diffs.reduce((s, d, i) => s + (d > 0 ? ranks[i] : 0), 0);
  const totalRank = ranks.reduce((s, r) => s + r, 0);
  const obs = Math.abs(wPlus - totalRank / 2);

  let extreme = 0;
  for (let i = 0; i < permutations; i++) {
    let pw = 0;
    for (let j = 0; j < ranks.length; j++) {
      if (Math.random() < 0.5) pw += ranks[j];
    }
    if (Math.abs(pw - totalRank / 2) >= obs) extreme++;
  }
  const p = (extreme + 1) / (permutations + 1);
  return { w: wPlus, p };
};

const oneWayAnova = (groups: number[][], permutations = 500) => {
  const k = groups.length;
  const n = groups.reduce((s, g) => s + g.length, 0);
  const grand = mean(groups.flat());
  const ssBetween = groups.reduce((s, g) => s + g.length * (mean(g) - grand) ** 2, 0);
  const ssWithin = groups.reduce((s, g) => s + g.reduce((acc, v) => acc + (v - mean(g)) ** 2, 0), 0);
  const df1 = k - 1;
  const df2 = n - k;
  const f = (ssBetween / df1) / (ssWithin / df2 || 1e-9);

  const all = groups.flat();
  const sizes = groups.map((g) => g.length);
  let extreme = 0;
  for (let i = 0; i < permutations; i++) {
    const sh = shuffle(all);
    const permGroups: number[][] = [];
    let offset = 0;
    sizes.forEach((sz) => {
      permGroups.push(sh.slice(offset, offset + sz));
      offset += sz;
    });
    const pGrand = mean(permGroups.flat());
    const pSSB = permGroups.reduce((s, g) => s + g.length * (mean(g) - pGrand) ** 2, 0);
    const pSSW = permGroups.reduce((s, g) => s + g.reduce((acc, v) => acc + (v - mean(g)) ** 2, 0), 0);
    const pF = (pSSB / df1) / (pSSW / df2 || 1e-9);
    if (pF >= f) extreme++;
  }
  const p = (extreme + 1) / (permutations + 1);

  const ssTotal = ssBetween + ssWithin;
  const eta2 = ssTotal === 0 ? 0 : ssBetween / ssTotal;
  const effect = Math.sqrt(eta2 / Math.max(1e-9, 1 - eta2));
  const power = approxPowerFromEffect(effect, n);
  return { f, p, df1, df2, power };
};

const kruskalWallis = (groups: number[][], permutations = 500) => {
  const all = groups.flat();
  const n = all.length;
  const ranks = rankValues(all);
  let offset = 0;
  let h = 0;
  groups.forEach((g) => {
    const rSum = ranks.slice(offset, offset + g.length).reduce((s, v) => s + v, 0);
    h += (rSum ** 2) / g.length;
    offset += g.length;
  });
  h = (12 / (n * (n + 1))) * h - 3 * (n + 1);

  const sizes = groups.map((g) => g.length);
  let extreme = 0;
  for (let i = 0; i < permutations; i++) {
    const sh = shuffle(all);
    const pr = rankValues(sh);
    let off = 0;
    let ph = 0;
    sizes.forEach((sz) => {
      const rSum = pr.slice(off, off + sz).reduce((s, v) => s + v, 0);
      ph += (rSum ** 2) / sz;
      off += sz;
    });
    ph = (12 / (n * (n + 1))) * ph - 3 * (n + 1);
    if (ph >= h) extreme++;
  }
  const p = (extreme + 1) / (permutations + 1);
  return { h, p, df: groups.length - 1 };
};

const repeatedMeasuresAnova = (matrix: number[][], permutations = 400) => {
  const n = matrix.length;
  const k = matrix[0].length;
  const values = matrix.flat();
  const grand = mean(values);

  const subjectMeans = matrix.map((row) => mean(row));
  const conditionMeans = Array.from({ length: k }, (_, j) => mean(matrix.map((row) => row[j])));

  const ssTotal = values.reduce((s, v) => s + (v - grand) ** 2, 0);
  const ssSubjects = k * subjectMeans.reduce((s, m) => s + (m - grand) ** 2, 0);
  const ssConditions = n * conditionMeans.reduce((s, m) => s + (m - grand) ** 2, 0);
  const ssError = ssTotal - ssSubjects - ssConditions;

  const df1 = k - 1;
  const df2 = (n - 1) * (k - 1);
  const f = (ssConditions / df1) / (ssError / df2 || 1e-9);

  let extreme = 0;
  for (let i = 0; i < permutations; i++) {
    const pm = matrix.map((row) => shuffle(row));
    const pValues = pm.flat();
    const pGrand = mean(pValues);
    const pSubMeans = pm.map((row) => mean(row));
    const pCondMeans = Array.from({ length: k }, (_, j) => mean(pm.map((row) => row[j])));
    const pSSTotal = pValues.reduce((s, v) => s + (v - pGrand) ** 2, 0);
    const pSSSubjects = k * pSubMeans.reduce((s, m) => s + (m - pGrand) ** 2, 0);
    const pSSConditions = n * pCondMeans.reduce((s, m) => s + (m - pGrand) ** 2, 0);
    const pSSError = pSSTotal - pSSSubjects - pSSConditions;
    const pF = (pSSConditions / df1) / (pSSError / df2 || 1e-9);
    if (pF >= f) extreme++;
  }
  const p = (extreme + 1) / (permutations + 1);

  const partialEta = ssConditions / Math.max(1e-9, ssConditions + ssError);
  const effect = Math.sqrt(partialEta / Math.max(1e-9, 1 - partialEta));
  const power = approxPowerFromEffect(effect, n);
  return { f, p, df1, df2, power };
};

const friedmanTest = (matrix: number[][], permutations = 400) => {
  const n = matrix.length;
  const k = matrix[0].length;
  const rankMatrix = matrix.map((row) => rankValues(row));
  const colRankSums = Array.from({ length: k }, (_, j) => rankMatrix.reduce((s, row) => s + row[j], 0));
  const q = (12 / (n * k * (k + 1))) * colRankSums.reduce((s, r) => s + r * r, 0) - 3 * n * (k + 1);

  let extreme = 0;
  for (let i = 0; i < permutations; i++) {
    const pm = matrix.map((row) => shuffle(row));
    const pr = pm.map((row) => rankValues(row));
    const sums = Array.from({ length: k }, (_, j) => pr.reduce((s, row) => s + row[j], 0));
    const pq = (12 / (n * k * (k + 1))) * sums.reduce((s, r) => s + r * r, 0) - 3 * n * (k + 1);
    if (pq >= q) extreme++;
  }
  const p = (extreme + 1) / (permutations + 1);
  return { q, p, df: k - 1 };
};

const App: React.FC = () => {
  // --- State ---
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // UI State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isUserMgmtOpen, setIsUserMgmtOpen] = useState(false);
  const [showRecycleBin, setShowRecycleBin] = useState(false);
  const [activePage, setActivePage] = useState<AppPage>('subjects');
  const [language, setLanguage] = useState<AppLanguage>(() => {
    try {
      const saved = localStorage.getItem('biomechbase.language');
      return saved === 'zh' ? 'zh' : 'en';
    } catch {
      return 'en';
    }
  });

  // Selection + Stats State
  const [studyProtocols, setStudyProtocols] = useState<StudyProtocol[]>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<Set<string>>(new Set());
  const [criteriaCohort, setCriteriaCohort] = useState('ALL');
  const [criteriaDiagnosis, setCriteriaDiagnosis] = useState('ALL');
  const [criteriaSex, setCriteriaSex] = useState('ALL');
  const [criteriaAffectedSide, setCriteriaAffectedSide] = useState('ALL');

  // Inferential Stats Module State
  const [analysisScope, setAnalysisScope] = useState<AnalysisScope>('cohort');
  const [analysisFeatureField, setAnalysisFeatureField] = useState<FeatureField>('diagnosis');
  const [analysisCohortFilter, setAnalysisCohortFilter] = useState('ALL');
  const [analysisPairKey, setAnalysisPairKey] = useState<PairKey>('subject_id');
  
  // Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Inline confirmation state (replaces window.confirm / alert)
  const [appError, setAppError] = useState<string | null>(null);
  const [appSuccess, setAppSuccess] = useState<string | null>(null);
  const [confirmSoftDeleteSubject, setConfirmSoftDeleteSubject] = useState<Subject | null>(null);
  const [confirmHardDeleteId, setConfirmHardDeleteId] = useState<string | null>(null);
  const [confirmRestoreDbPending, setConfirmRestoreDbPending] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null); // For CSV Import
  const dbInputRef = useRef<HTMLInputElement>(null);   // For DB Restore
  const t = UI_TEXT[language];

  const toggleLanguage = () => {
    setLanguage((prev) => (prev === 'en' ? 'zh' : 'en'));
  };

  const displaySex = (value: Sex): string => {
    if (language === 'en') return value;
    if (value === Sex.Male) return t.male;
    if (value === Sex.Female) return t.female;
    if (value === Sex.Intersex) return t.intersex;
    return t.other;
  };

  const displayAffectedSide = (value: AffectedSide): string => {
    if (language === 'en') return value;
    if (value === AffectedSide.Right) return t.sideRight;
    if (value === AffectedSide.Left) return t.sideLeft;
    if (value === AffectedSide.Bilateral) return t.sideBilateral;
    return t.sideNone;
  };

  const displayRole = (user: User): string => {
    if (user.role === 'Admin') return user.adminTier === 1 ? (language === 'zh' ? '主管理员' : 'Primary Admin') : t.admin;
    const value = user.role;
    if (value === 'Researcher') return t.researcher;
    return t.visitor;
  };

  const translateCategoryValue = (value: string): string => {
    if (value === Sex.Male) return displaySex(Sex.Male);
    if (value === Sex.Female) return displaySex(Sex.Female);
    if (value === Sex.Intersex) return displaySex(Sex.Intersex);
    if (value === Sex.Other) return displaySex(Sex.Other);
    if (value === AffectedSide.Right) return displayAffectedSide(AffectedSide.Right);
    if (value === AffectedSide.Left) return displayAffectedSide(AffectedSide.Left);
    if (value === AffectedSide.Bilateral) return displayAffectedSide(AffectedSide.Bilateral);
    if (value === AffectedSide.None) return displayAffectedSide(AffectedSide.None);
    return value;
  };

  const translateInferentialTest = (name: string): string => {
    if (language === 'en') return name;
    const map: Record<string, string> = {
      'Insufficient Data': '数据不足',
      'Independent t-test': '独立样本 t 检验',
      'Mann-Whitney U': 'Mann-Whitney U 检验',
      'One-way ANOVA': '单因素方差分析',
      'Kruskal-Wallis': 'Kruskal-Wallis 检验',
      'Paired t-test': '配对 t 检验',
      'Wilcoxon signed-rank': 'Wilcoxon 符号秩检验',
      'One-way repeated-measures ANOVA': '单因素重复测量方差分析',
      'Friedman test': 'Friedman 检验',
      'Paired test': '配对检验',
      'Repeated-measures test': '重复测量检验'
    };
    return map[name] || name;
  };

  const translateMeasureLabel = (label: string): string => {
    if (language === 'en') return label;
    return MEASURE_LABEL_ZH[label] || label;
  };

  const translateInferentialNote = (note: string): string => {
    if (language === 'en') return note;
    if (note === 'Select at least 2 subjects to run inferential statistics.') return '请至少选择 2 名受试者后再进行推断统计。';
    if (note === 'Need at least 2 non-empty groups for comparison.') return '比较时至少需要 2 个非空分组。';
    if (note === 'At least one group has no valid values.') return '至少有一个分组缺少有效数值。';
    if (note.startsWith('Insufficient matched pairs by ')) {
      const key = note.replace('Insufficient matched pairs by ', '').replace('.', '');
      return `按 ${key} 配对后，可用配对样本不足。`;
    }
    return note;
  };

  // --- Initialization ---
  useEffect(() => {
    const user = authService.getCurrentUser();
    if (user) {
      setCurrentUser(user);
    }
  }, []);

  useEffect(() => {
    const onSessionExpired = (event: Event) => {
      const customEvent = event as CustomEvent<{ message?: string }>;
      const message = customEvent.detail?.message || 'Session expired or invalid. Please sign in again.';
      setCurrentUser(null);
      setSubjects([]);
      setIsUserMgmtOpen(false);
      setIsFormOpen(false);
      setEditingSubject(null);
      setIsLoginOpen(true);
      setAppError(message);
    };

    window.addEventListener('biomech:session-expired', onSessionExpired as EventListener);
    return () => window.removeEventListener('biomech:session-expired', onSessionExpired as EventListener);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('biomechbase.language', language);
    } catch {
      // ignore storage failures
    }
  }, [language]);

  const loadData = async () => {
    if (!currentUser) {
      setSubjects([]);
      return;
    }

    try {
      if (showRecycleBin) {
        setSubjects(await dataService.getDeleted());
      } else {
        setSubjects(await dataService.getAll(false));
      }
    } catch (error) {
      console.error('Failed to load data', error);
    }
  };

  const loadStudyProtocols = async () => {
    if (!currentUser) {
      setStudyProtocols([]);
      return;
    }

    try {
      const all = await studyProtocolService.getAll();
      setStudyProtocols(all);
    } catch (error) {
      console.error('Failed to load study protocols', error);
    }
  };

  // Reload data when user/view changes
  useEffect(() => {
    loadData();
  }, [showRecycleBin, currentUser]);

  useEffect(() => {
    loadStudyProtocols();
  }, [currentUser]);

  // --- Auth Handlers ---
  const handleLogin = (user: User) => {
    setCurrentUser(user);
    setIsLoginOpen(false);
  };

  const handleLogout = async () => {
    await authService.logout();
    setCurrentUser(null);
    setSubjects([]);
  };

  // --- CRUD Operations (Via DataService) ---
  
  const handleAddSubject = async (data: Omit<Subject, 'id'>) => {
    if (!currentUser) return;
    try {
      // Cast to satisfy TS, though create ignores system fields
      await dataService.create(data as any, currentUser);
      await loadData();
      setIsFormOpen(false);
    } catch (e: any) {
      if (isSessionError(e?.message)) return;
      setAppError(e.message);
    }
  };

  const handleEditSubject = async (data: Omit<Subject, 'id'>) => {
    if (!editingSubject || !currentUser) return;
    try {
      await dataService.update(editingSubject.id, data, currentUser, editingSubject);
      setEditingSubject(null);
      setIsFormOpen(false);
      await loadData();
    } catch (e: any) {
      if (isSessionError(e?.message)) return;
      setAppError(e.message);
    }
  };

  const handleSoftDelete = (subject: Subject) => {
    setConfirmSoftDeleteSubject(subject);
  };

  const executeSoftDelete = async () => {
    if (!currentUser || !confirmSoftDeleteSubject) return;
    setConfirmSoftDeleteSubject(null);
    try {
      await dataService.softDelete(confirmSoftDeleteSubject.id, currentUser, confirmSoftDeleteSubject.version);
      await loadData();
    } catch (e: any) {
      if (isSessionError(e?.message)) return;
      setAppError(e.message);
    }
  };

  const handleRestore = async (subject: Subject) => {
    if (!currentUser) return;
    try {
      await dataService.restore(subject.id, currentUser, subject.version);
      await loadData();
    } catch (e: any) {
      if (isSessionError(e?.message)) return;
      setAppError(e.message);
    }
  };

  const handleHardDelete = (id: string) => {
    setConfirmHardDeleteId(id);
  };

  const executeHardDelete = async () => {
    if (!confirmHardDeleteId) return;
    const id = confirmHardDeleteId;
    setConfirmHardDeleteId(null);
    try {
      await dataService.hardDelete(id);
      await loadData();
    } catch (e: any) {
      setAppError(e.message);
    }
  };

  const startEdit = (subject: Subject) => {
    setEditingSubject(subject);
    setIsFormOpen(true);
  };

  // --- Database Operations ---

  const handleBackupDB = async () => {
    const dataStr = await dataService.generateBackup();
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `biomech_FULL_BACKUP_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRestoreDBClick = () => {
    setConfirmRestoreDbPending(true);
  };

  const executeRestoreDB = () => {
    setConfirmRestoreDbPending(false);
    dbInputRef.current?.click();
  };

  const handleRestoreDBFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        await dataService.restoreBackup(content);
        setAppSuccess(t.restoreSuccess);
        setTimeout(() => window.location.reload(), 1500);
      } catch (err: any) {
        if (isSessionError(err?.message)) return;
        setAppError(`${t.restoreFailed} ${err.message}`);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // --- CSV Import/Export ---

  const handleDownloadTemplate = () => {
    const headers = CSV_HEADERS.join(",");
    
    // Updated Sample Values to match new header order (Real Name/Contact moved to idx 1 & 2)
    const sampleValues = [
      "S-EXAMPLE", 
      "John Doe", "john@example.com", // Identity Fields
      "SITE-01", "Control", "2024-01-01", "JD-999",
      "Male", "1990-01-01", "Right", "Right", "180", "75", "23.1",
      "42", "50",
      "85", "85", "45", "45", "40", "40", "25", "25", "10", "10", "7", "7",
      "Healthy", "None", "0", "None", "None",
      "true", "IRB-2024-001", "Dr. Smith", "false", "Sample note"
    ];

    const csvContent = "data:text/csv;charset=utf-8," + headers + "\n" + sampleValues.join(",");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "biomech_import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCSVImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleCSVFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !currentUser) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      try {
        const lines = text.split('\n').filter(l => l.trim());
        const headers = lines[0].split(',').map(h => h.trim());
        
        // Validation: Ensure headers exist
        if (headers.length < 5) {
             throw new Error("CSV seems to have too few columns. Please use the provided template.");
        }

        let successCount = 0;
        let errors = [];

        for (let i = 1; i < lines.length; i++) {
            // Simple Split - does not handle comma within quotes
            const values = lines[i].split(',').map(v => v.trim());
            
            if (values.length === 0) continue;

            const row: any = {};
            // Map by header name
            headers.forEach((h, idx) => {
                if(idx < values.length) row[h] = values[idx];
            });

            // If required fields missing, skip
            if (!row.subject_id || !row.cohort_group) {
                errors.push(`Row ${i+1}: Missing Subject ID or Cohort.`);
                continue;
            }

            // Construct Subject Object
            try {
                // Auto-generate name code if not provided
                let nameCode = row.name_code;
                if (!nameCode && row.real_name) {
                    const parts = row.real_name.split(' ');
                    const initials = parts.map((p: string) => p[0]).join('').toUpperCase().substring(0,3);
                    const rnd = Math.floor(100 + Math.random() * 900);
                    nameCode = `${initials}-${rnd}`;
                }

                // Parse Helpers
                const num = (v: string) => (v && !isNaN(Number(v))) ? Number(v) : undefined;
                const bool = (v: string) => v?.toLowerCase() === 'true' || v === '1';

                const h = num(row.height_cm) || 0;
                const m = num(row.mass_kg) || 0;
                // Use provided BMI or calculate it
                const bmi = num(row.bmi) || ((h > 0 && m > 0) ? Number((m / ((h/100)**2)).toFixed(1)) : 0);

                const newSubject: Partial<Subject> = {
                    ...INITIAL_SUBJECT_STATE,
                    subject_id: row.subject_id,
                    site_id: row.site_id,
                    cohort_group: row.cohort_group,
                    enrollment_date: row.enrollment_date || new Date().toISOString().split('T')[0],
                    real_name: row.real_name,
                    contact_info: row.contact_info,
                    name_code: nameCode || `IMP-${Date.now()}`,
                    
                    // Enums with fallback
                    sex: Object.values(Sex).includes(row.sex) ? row.sex : Sex.Other,
                    dob: row.dob,
                    handedness: Object.values(Handedness).includes(row.handedness) ? row.handedness : Handedness.Right,
                    leg_dominance: Object.values(Handedness).includes(row.leg_dominance) ? row.leg_dominance : Handedness.Right,
                    
                    // Metrics
                    height_cm: h,
                    mass_kg: m,
                    bmi: bmi,
                    shoe_size_eu: num(row.shoe_size_eu),
                    trunk_length_cm: num(row.trunk_length_cm),
                    
                    limb_length_l_cm: num(row.limb_length_l_cm),
                    limb_length_r_cm: num(row.limb_length_r_cm),
                    thigh_length_l_cm: num(row.thigh_length_l_cm),
                    thigh_length_r_cm: num(row.thigh_length_r_cm),
                    shank_length_l_cm: num(row.shank_length_l_cm),
                    shank_length_r_cm: num(row.shank_length_r_cm),
                    foot_length_l_cm: num(row.foot_length_l_cm),
                    foot_length_r_cm: num(row.foot_length_r_cm),
                    knee_width_l_cm: num(row.knee_width_l_cm),
                    knee_width_r_cm: num(row.knee_width_r_cm),
                    ankle_width_l_cm: num(row.ankle_width_l_cm),
                    ankle_width_r_cm: num(row.ankle_width_r_cm),

                    diagnosis: row.diagnosis,
                    affected_side: Object.values(AffectedSide).includes(row.affected_side) ? row.affected_side : AffectedSide.None,
                    severity_scale: row.severity_scale,
                    surgery_history: row.surgery_history,
                    medications: row.medications,
                    
                    consent_status: bool(row.consent_status),
                    irb_protocol: row.irb_protocol,
                    assessor: row.assessor,
                    exclusion_flag: bool(row.exclusion_flag),
                    notes: row.notes
                };

                await dataService.create(newSubject as any, currentUser);
                successCount++;
            } catch (err: any) {
                errors.push(`Row ${i + 1}: ${err.message}`);
            }
        }

            await loadData();
        let msg = `${t.importComplete} ${successCount} ${t.recordsAdded}`;
        if (errors.length > 0) msg += `\n\n${t.errors}:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? '\n...' : ''}`;
        setAppSuccess(msg);

      } catch (err: any) {
        if (isSessionError(err?.message)) return;
        setAppError(`${t.importFailed} ${err.message}`);
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset
  };

  // --- Export (View Only) ---
  const handleExportView = () => {
    const headers = canViewConfidential
      ? CSV_HEADERS
      : CSV_HEADERS.filter((header) => header !== 'real_name' && header !== 'contact_info');

    const rows = subjects.map((subject) =>
      headers.map((header) => {
        const value = (subject as any)[header];
        if (value === undefined || value === null) return '';
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        return String(value);
      })
    );

    const dataStr = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([dataStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `biomech_export_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // --- Filtering ---
  const role = currentUser?.role || 'Visitor';
  const canViewConfidential = role === 'Admin' || Boolean((currentUser as any)?.confidentialAccess);
  const filteredSubjects = subjects.filter((s) => {
    if (!s || typeof s !== 'object') return false;
    const q = searchTerm.toLowerCase();
    return (
      String(s.subject_id || '').toLowerCase().includes(q) ||
      String(s.cohort_group || '').toLowerCase().includes(q) ||
      String(s.diagnosis || '').toLowerCase().includes(q) ||
      (canViewConfidential && String(s.real_name || '').toLowerCase().includes(q))
    );
  });

  const selectedSubjects = useMemo(
    () => subjects.filter((s) => selectedSubjectIds.has(getSelectionKey(s))),
    [subjects, selectedSubjectIds]
  );

  const allVisibleSelected = filteredSubjects.length > 0 && filteredSubjects.every((s) => selectedSubjectIds.has(getSelectionKey(s)));

  const uniqueCohorts = useMemo(() => Array.from(new Set(subjects.map((s) => s.cohort_group).filter(Boolean))).sort(), [subjects]);
  const uniqueDiagnoses = useMemo(() => Array.from(new Set(subjects.map((s) => s.diagnosis || '').filter(Boolean))).sort(), [subjects]);

  useEffect(() => {
    setSelectedSubjectIds((prev) => {
      const validIds = new Set(subjects.map((s) => getSelectionKey(s)).filter(Boolean));
      const next = new Set<string>();
      prev.forEach((id) => {
        if (validIds.has(id)) next.add(id);
      });
      return next;
    });
  }, [subjects]);

  const toggleSubjectSelection = (id: string) => {
    setSelectedSubjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedSubjectIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filteredSubjects.forEach((s) => next.delete(getSelectionKey(s)));
      } else {
        filteredSubjects.forEach((s) => next.add(getSelectionKey(s)));
      }
      return next;
    });
  };

  const handleSelectByCriteria = () => {
    const matched = subjects.filter((s) => {
      const cohortOk = criteriaCohort === 'ALL' || normalizeText(s.cohort_group) === normalizeText(criteriaCohort);
      const diagnosisOk = criteriaDiagnosis === 'ALL' || normalizeText(s.diagnosis) === normalizeText(criteriaDiagnosis);
      const sexOk = criteriaSex === 'ALL' || normalizeText(s.sex) === normalizeText(criteriaSex);
      const affectedOk = criteriaAffectedSide === 'ALL' || normalizeText(s.affected_side) === normalizeText(criteriaAffectedSide);
      return cohortOk && diagnosisOk && sexOk && affectedOk;
    });

    setSelectedSubjectIds(new Set(matched.map((s) => getSelectionKey(s)).filter(Boolean)));
  };

  const selectedStats = useMemo(() => {
    return NUMERIC_MEASURES.map((measure) => {
      const values = selectedSubjects
        .map((s) => {
          const raw = s[measure.key];
          if (raw === null || raw === undefined) return null;
          if (typeof raw === 'string' && raw.trim() === '') return null;
          const num = typeof raw === 'number' ? raw : Number(raw);
          return Number.isFinite(num) ? num : null;
        })
        .filter((v): v is number => v !== null);

      const n = values.length;
      if (n === 0) {
        return {
          measure: measure.label,
          n: 0,
          mean: NaN,
          sd: NaN,
          iqr: NaN,
          range95Low: NaN,
          range95High: NaN
        };
      }

      const mean = values.reduce((sum, value) => sum + value, 0) / n;
      const variance = n > 1
        ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1)
        : 0;
      const sd = Math.sqrt(variance);
      const sorted = [...values].sort((a, b) => a - b);
      const { q1, q3 } = quartiles(sorted);
      const iqr = q3 - q1;
      const range95Low = quantile(sorted, 0.025);
      const range95High = quantile(sorted, 0.975);

      return {
        measure: measure.label,
        n,
        mean,
        sd,
        iqr,
        range95Low,
        range95High
      };
    });
  }, [selectedSubjects]);

  const inferentialResults = useMemo(() => {
    const pool = (selectedSubjects.length > 0 ? selectedSubjects : subjects).filter((s) => !s.isDeleted);
    if (pool.length < 2) {
      return {
        mode: null as AnalysisMode | null,
        groupNames: [] as string[],
        rows: [] as AnalysisRow[],
        note: 'Select at least 2 subjects to run inferential statistics.'
      };
    }

    const scopedPool = analysisScope === 'feature' && analysisCohortFilter !== 'ALL'
      ? pool.filter((s) => (s.cohort_group || '') === analysisCohortFilter)
      : pool;

    const groupMap: Record<string, Subject[]> = {};
    scopedPool.forEach((subject) => {
      const groupValue = analysisScope === 'cohort'
        ? (subject.cohort_group || 'Unknown')
        : (String((subject as any)[analysisFeatureField] || '').trim() || 'Unknown');
      if (!groupMap[groupValue]) groupMap[groupValue] = [];
      groupMap[groupValue].push(subject);
    });

    const groupNames = Object.keys(groupMap).filter((g) => groupMap[g].length > 0);
    if (groupNames.length < 2) {
      return {
        mode: null as AnalysisMode | null,
        groupNames,
        rows: [] as AnalysisRow[],
        note: 'Need at least 2 non-empty groups for comparison.'
      };
    }

    const mode: AnalysisMode = analysisScope === 'cohort'
      ? (groupNames.length === 2 ? 'independent-2' : 'anova')
      : (groupNames.length === 2 ? 'paired-2' : 'repeated');

    const rows: AnalysisRow[] = NUMERIC_MEASURES.map((measure) => {
      const groupValues = groupNames.map((groupName) => {
        const values = groupMap[groupName]
          .map((s) => {
            const raw = s[measure.key];
            if (raw === null || raw === undefined) return null;
            if (typeof raw === 'string' && raw.trim() === '') return null;
            const v = typeof raw === 'number' ? raw : Number(raw);
            return Number.isFinite(v) ? v : null;
          })
          .filter((v): v is number => v !== null);
        return values;
      });

      const totalN = groupValues.reduce((s, g) => s + g.length, 0);
      if (totalN < 3 || groupValues.some((g) => g.length === 0)) {
        return {
          measure: measure.label,
          n: totalN,
          normalityP: NaN,
          testName: 'Insufficient Data',
          statisticLabel: '-',
          statisticValue: NaN,
          pValue: NaN,
          df: '-',
          power: NaN,
          note: 'At least one group has no valid values.'
        };
      }

      if (mode === 'independent-2') {
        const normals = groupValues.map((g) => jarqueBeraNormality(g));
        const normalP = Math.min(...normals.map((n) => n.p));
        const allNormal = normals.every((n) => n.isNormal);

        if (allNormal) {
          const result = independentTTest(groupValues[0], groupValues[1]);
          return {
            measure: measure.label,
            n: totalN,
            normalityP: normalP,
            testName: 'Independent t-test',
            statisticLabel: 't',
            statisticValue: result.t,
            pValue: result.p,
            df: result.df.toFixed(2),
            power: result.power
          };
        }

        const result = mannWhitneyUTest(groupValues[0], groupValues[1]);
        return {
          measure: measure.label,
          n: totalN,
          normalityP: normalP,
          testName: 'Mann-Whitney U',
          statisticLabel: 'U',
          statisticValue: result.u,
          pValue: result.p,
          df: '-',
          power: NaN
        };
      }

      if (mode === 'anova') {
        const normals = groupValues.map((g) => jarqueBeraNormality(g));
        const normalP = Math.min(...normals.map((n) => n.p));
        const allNormal = normals.every((n) => n.isNormal);

        if (allNormal) {
          const result = oneWayAnova(groupValues);
          return {
            measure: measure.label,
            n: totalN,
            normalityP: normalP,
            testName: 'One-way ANOVA',
            statisticLabel: 'F',
            statisticValue: result.f,
            pValue: result.p,
            df: `${result.df1}, ${result.df2}`,
            power: result.power
          };
        }

        const result = kruskalWallis(groupValues);
        return {
          measure: measure.label,
          n: totalN,
          normalityP: normalP,
          testName: 'Kruskal-Wallis',
          statisticLabel: 'H',
          statisticValue: result.h,
          pValue: result.p,
          df: `${result.df}`,
          power: NaN
        };
      }

      const pairMaps = groupNames.map((groupName) => {
        const map = new Map<string, number>();
        groupMap[groupName].forEach((subject) => {
          const key = String((subject as any)[analysisPairKey] || '').trim();
          if (!key) return;
          const raw = subject[measure.key];
          if (raw === null || raw === undefined) return;
          if (typeof raw === 'string' && raw.trim() === '') return;
          const value = typeof raw === 'number' ? raw : Number(raw);
          if (Number.isFinite(value)) map.set(key, value);
        });
        return map;
      });

      const sharedKeys = pairMaps.reduce<string[]>((acc, map, idx) => {
        const keys = Array.from(map.keys());
        if (idx === 0) return keys;
        return acc.filter((k) => map.has(k));
      }, []);

      if (sharedKeys.length < 2) {
        return {
          measure: measure.label,
          n: sharedKeys.length,
          normalityP: NaN,
          testName: mode === 'paired-2' ? 'Paired test' : 'Repeated-measures test',
          statisticLabel: '-',
          statisticValue: NaN,
          pValue: NaN,
          df: '-',
          power: NaN,
          note: `Insufficient matched pairs by ${analysisPairKey}.`
        };
      }

      if (mode === 'paired-2') {
        const pairedData: Array<[number, number]> = sharedKeys.map((key) => [pairMaps[0].get(key)!, pairMaps[1].get(key)!]);
        const diffs = pairedData.map(([a, b]) => a - b);
        const normality = jarqueBeraNormality(diffs);

        if (normality.isNormal) {
          const result = pairedTTest(pairedData);
          return {
            measure: measure.label,
            n: pairedData.length,
            normalityP: normality.p,
            testName: 'Paired t-test',
            statisticLabel: 't',
            statisticValue: result.t,
            pValue: result.p,
            df: `${result.df}`,
            power: result.power
          };
        }

        const result = wilcoxonSignedRankTest(pairedData);
        return {
          measure: measure.label,
          n: pairedData.length,
          normalityP: normality.p,
          testName: 'Wilcoxon signed-rank',
          statisticLabel: 'W',
          statisticValue: result.w,
          pValue: result.p,
          df: '-',
          power: NaN
        };
      }

      const matrix = sharedKeys.map((key) => pairMaps.map((map) => map.get(key)!));
      const perConditionNormal = Array.from({ length: groupNames.length }, (_, i) => jarqueBeraNormality(matrix.map((row) => row[i])));
      const normalP = Math.min(...perConditionNormal.map((n) => n.p));
      const allNormal = perConditionNormal.every((n) => n.isNormal);

      if (allNormal) {
        const result = repeatedMeasuresAnova(matrix);
        return {
          measure: measure.label,
          n: matrix.length,
          normalityP: normalP,
          testName: 'One-way repeated-measures ANOVA',
          statisticLabel: 'F',
          statisticValue: result.f,
          pValue: result.p,
          df: `${result.df1}, ${result.df2}`,
          power: result.power
        };
      }

      const result = friedmanTest(matrix);
      return {
        measure: measure.label,
        n: matrix.length,
        normalityP: normalP,
        testName: 'Friedman test',
        statisticLabel: 'Q',
        statisticValue: result.q,
        pValue: result.p,
        df: `${result.df}`,
        power: NaN
      };
    });

    return {
      mode,
      groupNames,
      rows,
      note: ''
    };
  }, [selectedSubjects, subjects, analysisScope, analysisFeatureField, analysisCohortFilter, analysisPairKey]);

  const formatStat = (value: number): string => (Number.isFinite(value) ? value.toFixed(3) : '-');
  const formatP = (value: number): string => {
    if (!Number.isFinite(value)) return '-';
    if (value < 0.001) return '<0.001';
    return value.toFixed(3);
  };
  const formatPower = (value: number): string => (Number.isFinite(value) ? value.toFixed(3) : '-');

  const handleDownloadSelectedStatsCsv = () => {
    if (selectedSubjects.length === 0) return;

    const headers = ['measure', 'n', 'mean', 'standard_deviation', 'interquartile_range', 'range_95_low', 'range_95_high'];
    const rows = selectedStats.map((row) => [
      row.measure,
      String(row.n),
      formatStat(row.mean),
      formatStat(row.sd),
      formatStat(row.iqr),
      formatStat(row.range95Low),
      formatStat(row.range95High)
    ]);

    const csv = [headers.join(','), ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `selected_subject_statistics_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadSelectedRowsCsv = () => {
    if (selectedSubjects.length === 0) return;

    const headers = canViewConfidential
      ? CSV_HEADERS
      : CSV_HEADERS.filter((header) => header !== 'real_name' && header !== 'contact_info');

    const rows = selectedSubjects.map((subject) =>
      headers.map((header) => {
        const value = (subject as any)[header];
        if (value === undefined || value === null) return '';
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        return String(value);
      })
    );

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `selected_subject_rows_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadInferentialCsv = () => {
    if (inferentialResults.rows.length === 0) return;

    const headers = ['measure', 'n', 'normality_p', 'test', 'statistic', 'df', 'p_value', 'power', 'note'];
    const rows = inferentialResults.rows.map((row) => [
      row.measure,
      String(row.n),
      formatP(row.normalityP),
      row.testName,
      `${row.statisticLabel}=${formatStat(row.statisticValue)}`,
      row.df,
      formatP(row.pValue),
      formatPower(row.power),
      row.note || ''
    ]);

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `inferential_statistics_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Global Toast Notifications */}
      {appError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] max-w-lg w-full px-4">
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 shadow-lg flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <span className="flex-1 text-sm">{appError}</span>
            <button onClick={() => setAppError(null)} className="text-red-400 hover:text-red-600 flex-shrink-0" aria-label="Dismiss error">✕</button>
          </div>
        </div>
      )}
      {appSuccess && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] max-w-lg w-full px-4">
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-3 shadow-lg flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
            <span className="flex-1 text-sm">{appSuccess}</span>
            <button onClick={() => setAppSuccess(null)} className="text-green-400 hover:text-green-600 flex-shrink-0" aria-label="Dismiss">✕</button>
          </div>
        </div>
      )}
      {/* Soft Delete Confirmation Dialog */}
      {confirmSoftDeleteSubject && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-3">
              <Trash2 className="h-6 w-6 text-orange-500 flex-shrink-0" />
              <h3 className="text-base font-semibold text-gray-900">{t.confirmMoveRecycle}</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">{confirmSoftDeleteSubject.subject_id}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmSoftDeleteSubject(null)} className="px-3 py-1.5 text-sm border border-gray-300 rounded text-gray-700 hover:bg-gray-50">{t.cancel || 'Cancel'}</button>
              <button onClick={executeSoftDelete} className="px-3 py-1.5 text-sm bg-orange-500 text-white rounded hover:bg-orange-600">{t.moveToRecycleBin}</button>
            </div>
          </div>
        </div>
      )}
      {/* Hard Delete Confirmation Dialog */}
      {confirmHardDeleteId && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-3">
              <AlertTriangle className="h-6 w-6 text-red-600 flex-shrink-0" />
              <h3 className="text-base font-semibold text-gray-900">{t.confirmHardDelete}</h3>
            </div>
            <p className="text-sm text-gray-500 mb-4">This action cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmHardDeleteId(null)} className="px-3 py-1.5 text-sm border border-gray-300 rounded text-gray-700 hover:bg-gray-50">{t.cancel || 'Cancel'}</button>
              <button onClick={executeHardDelete} className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700">{t.permanentlyDelete}</button>
            </div>
          </div>
        </div>
      )}
      {/* Restore DB Confirmation Dialog */}
      {confirmRestoreDbPending && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-3">
              <AlertTriangle className="h-6 w-6 text-red-600 flex-shrink-0" />
              <h3 className="text-base font-semibold text-gray-900">{t.confirmRestoreDb}</h3>
            </div>
            <p className="text-sm text-gray-500 mb-4">All current data will be overwritten.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmRestoreDbPending(false)} className="px-3 py-1.5 text-sm border border-gray-300 rounded text-gray-700 hover:bg-gray-50">{t.cancel || 'Cancel'}</button>
              <button onClick={executeRestoreDB} className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700">{t.restoreDb || 'Restore'}</button>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center py-3 gap-3">
            <div className="flex items-center gap-3">
              <div className="relative h-16 w-16 flex-shrink-0 p-1">
                <Activity className="absolute inset-0 m-auto h-10 w-10 text-indigo-600" />
                <img
                  src="/hippony-logo.png"
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 h-full w-full object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-blue-800 tracking-tight leading-tight">BiomechBase</h1>
                <p className="text-sm text-gray-500 whitespace-nowrap leading-tight">{t.clinicalDataManager}</p>
              </div>
            </div>

            <div className="w-full lg:w-auto flex flex-wrap items-center justify-end gap-2">
              <Button variant="ghost" icon={<Languages size={16} />} onClick={toggleLanguage} title={t.languageToggleTitle}>
                {language === 'en' ? '中文' : 'EN'}
              </Button>
              {currentUser ? (
                 <div className="flex items-center space-x-3">
                     {/* Admin Database Tools */}
                     {currentUser.role === 'Admin' && currentUser.adminTier === 1 && (
                       <div className="flex items-center bg-gray-100 rounded-lg p-1 mr-2 space-x-1">
                          <button
                            onClick={() => setIsUserMgmtOpen(true)}
                            className="p-1.5 text-gray-600 hover:text-indigo-600 rounded-md hover:bg-white transition-all"
                            title={t.manageUsers}
                          >
                            <Settings size={18} />
                          </button>
                          <div className="w-px h-4 bg-gray-300"></div>
                          <button
                            onClick={handleBackupDB}
                            className="p-1.5 text-gray-600 hover:text-indigo-600 rounded-md hover:bg-white transition-all"
                            title={t.backupDb}
                          >
                            <Database size={18} />
                          </button>
                          <button
                            onClick={handleRestoreDBClick}
                            className="p-1.5 text-gray-600 hover:text-red-600 rounded-md hover:bg-white transition-all"
                            title={t.restoreDb}
                          >
                             <Upload size={18} />
                          </button>
                          <input 
                            type="file" 
                            ref={dbInputRef} 
                            onChange={handleRestoreDBFile} 
                            className="hidden" 
                            accept=".json"
                          />
                       </div>
                     )}
                     
                     <div className="flex items-center bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100">
                        <UserIcon size={16} className="text-indigo-600 mr-2" />
                        <div className="flex flex-col text-right mr-2">
                          <span className="text-xs font-semibold text-indigo-900">{currentUser.username}</span>
                          <span className="text-[10px] text-indigo-500 uppercase tracking-wide">{displayRole(currentUser)}</span>
                        </div>
                        <button 
                          onClick={handleLogout} 
                          className="ml-2 text-gray-400 hover:text-red-500 transition-colors"
                          title={t.signOut}
                        >
                          <LogOut size={16} />
                        </button>
                     </div>
                 </div>
              ) : (
                <Button variant="secondary" icon={<LogIn size={16}/>} onClick={() => setIsLoginOpen(true)}>
                  {t.signIn}
                </Button>
              )}

              <div className="hidden lg:block h-6 w-px bg-gray-300 mx-2"></div>

              <div className="flex items-center bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setActivePage('subjects')}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    activePage === 'subjects' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:bg-white'
                  }`}
                >
                  {t.subjectRecords}
                </button>
                <button
                  onClick={() => setActivePage('protocols')}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors inline-flex items-center gap-1 ${
                    activePage === 'protocols' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:bg-white'
                  }`}
                >
                  <BookOpenText size={14} />
                  {t.studyProtocols}
                </button>
              </div>

              {/* Action Buttons */}
              {activePage === 'subjects' && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button variant="ghost" onClick={handleDownloadTemplate} title={t.downloadTemplate}>
                  <FileSpreadsheet size={18} className="text-green-600" />
                </Button>
                
                {currentUser && role !== 'Visitor' && (
                  <>
                      <Button variant="ghost" onClick={handleCSVImportClick} title={t.importCsv}>
                       <FileUp size={18} className="text-blue-600" />
                    </Button>
                    <input 
                       type="file" 
                       ref={fileInputRef} 
                       onChange={handleCSVFileChange} 
                       className="hidden" 
                       accept=".csv"
                    />
                  </>
                )}
                
                <Button variant="ghost" icon={<Download size={18}/>} onClick={handleExportView} disabled={subjects.length === 0} title={t.exportVisible}>
                  {t.export}
                </Button>

                <Button
                  variant="ghost"
                  icon={<Download size={18} />}
                  onClick={handleDownloadSelectedRowsCsv}
                  disabled={selectedSubjects.length === 0}
                  title={t.exportSelectedRows}
                >
                  {t.selectedCsv}
                </Button>
                
                {currentUser && role !== 'Visitor' && !showRecycleBin && (
                  <Button 
                    variant="primary" 
                    icon={<Plus size={18}/>} 
                    onClick={() => { setEditingSubject(null); setIsFormOpen(true); }}
                  >
                    {t.add}
                  </Button>
                )}
              </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activePage === 'protocols' ? (
          currentUser ? (
            <StudyProtocolPage
              currentUser={currentUser}
              language={language}
              onProtocolsChanged={setStudyProtocols}
            />
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-600">
              {language === 'zh' ? '请先登录后再管理研究方案。' : 'Please sign in first to manage study protocols.'}
            </div>
          )
        ) : (
          <>
        
        {!showRecycleBin && <StatsDashboard subjects={subjects} language={language} />}

        {/* Action Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
          <div className="relative w-full sm:w-96">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder={showRecycleBin ? t.searchDeleted : t.searchActive}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex space-x-3 items-center">
             {/* Recycle Bin Toggle */}
             {currentUser?.role === 'Admin' && (
                <button 
                  onClick={() => setShowRecycleBin(!showRecycleBin)}
                  className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    showRecycleBin 
                      ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                      : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-300'
                  }`}
                >
                   <Trash2 size={16} className="mr-2"/>
                   {showRecycleBin ? t.backToActive : t.recycleBin}
                </button>
             )}

             {!showRecycleBin && (
               <>
               </>
             )}
          </div>
        </div>

        {/* Selection + Criteria Tools */}
        {!showRecycleBin && (
          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t.cohort}</label>
                <select value={criteriaCohort} onChange={(e) => setCriteriaCohort(e.target.value)} className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm">
                  <option value="ALL">{t.all}</option>
                  {uniqueCohorts.map((cohort) => (
                    <option key={cohort} value={cohort}>{cohort}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t.diagnosis}</label>
                <select value={criteriaDiagnosis} onChange={(e) => setCriteriaDiagnosis(e.target.value)} className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm">
                  <option value="ALL">{t.all}</option>
                  {uniqueDiagnoses.map((diagnosis) => (
                    <option key={diagnosis} value={diagnosis}>{diagnosis}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t.sex}</label>
                <select value={criteriaSex} onChange={(e) => setCriteriaSex(e.target.value)} className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm">
                  <option value="ALL">{t.all}</option>
                  {Object.values(Sex).map((sex) => (
                    <option key={sex} value={sex}>{displaySex(sex)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t.affectedSide}</label>
                <select value={criteriaAffectedSide} onChange={(e) => setCriteriaAffectedSide(e.target.value)} className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm">
                  <option value="ALL">{t.all}</option>
                  {Object.values(AffectedSide).map((side) => (
                    <option key={side} value={side}>{displayAffectedSide(side)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={handleSelectByCriteria}>{t.selectByCriteria}</Button>
              <Button variant="ghost" onClick={() => setSelectedSubjectIds(new Set())}>{t.clearSelection}</Button>
              <Button variant="secondary" onClick={handleDownloadSelectedStatsCsv} disabled={selectedSubjects.length === 0}>{t.downloadSelectedStats}</Button>
              <Button variant="secondary" onClick={handleDownloadSelectedRowsCsv} disabled={selectedSubjects.length === 0}>{t.downloadSelectedRawData}</Button>
              <span className="text-sm text-gray-600 ml-1">{t.selected}: <b>{selectedSubjects.length}</b></span>
            </div>
          </div>
        )}

        {/* Recycle Bin Warning */}
        {showRecycleBin && (
           <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <Trash2 className="h-5 w-5 text-red-400" aria-hidden="true" />
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-700">
                    {t.recycleWarningPrefix} <b>{t.recycleWarningCore}</b>。{t.recycleWarningSuffix}
                  </p>
                </div>
              </div>
            </div>
        )}

        {/* Data Table */}
        <div className="bg-white shadow overflow-hidden border-b border-gray-200 sm:rounded-lg">
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} aria-label="Select all visible subjects" />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {canViewConfidential ? t.identityContact : t.deIdentifiedCode}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t.cohortDx}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t.demographics}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t.status}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t.version}</th>
                  <th className="relative px-6 py-3"><span className="sr-only">{t.actions}</span></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredSubjects.length === 0 ? (
                   <tr>
                     <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                       <FileText className="mx-auto h-12 w-12 text-gray-300" />
                       <p className="mt-2 text-sm font-medium">{t.noRecordsFound} {showRecycleBin ? t.inTrash : ''}</p>
                     </td>
                   </tr>
                ) : (
                  filteredSubjects.map((subject) => (
                    <tr key={getSelectionKey(subject)} className="hover:bg-gray-50">
                      <td className="px-4 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedSubjectIds.has(getSelectionKey(subject))}
                          onChange={() => toggleSubjectSelection(getSelectionKey(subject))}
                          aria-label={`Select ${subject.subject_id}`}
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {canViewConfidential ? (
                          <>
                            <div className="text-sm font-bold text-gray-900">{subject.real_name || t.unknownName}</div>
                            <div className="text-xs text-gray-500">{subject.contact_info || t.noContactInfo}</div>
                            <div className="text-xs text-indigo-600 mt-1">{t.id}: {subject.subject_id}</div>
                          </>
                        ) : (
                          <>
                            <div className="text-sm font-bold text-indigo-600 flex items-center">
                              <Shield size={12} className="mr-1"/> {subject.name_code || t.pending}
                            </div>
                            <div className="text-xs text-gray-400">{t.id}: {subject.subject_id}</div>
                          </>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {subject.cohort_group}
                        </span>
                        <div className="text-sm text-gray-900 mt-1">{subject.diagnosis || t.healthy}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{displaySex(subject.sex)}</div>
                        <div className="text-xs text-gray-500">{t.dob}: {subject.dob || t.na}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {subject.exclusion_flag ? (
                          <span className="inline-flex items-center text-xs font-medium text-red-600">
                            <AlertCircle className="w-3 h-3 mr-1"/> {t.excluded}
                          </span>
                        ) : subject.consent_status ? (
                          <span className="text-xs text-green-600">{t.consented}</span>
                        ) : (
                          <span className="text-xs text-gray-400">{t.noConsent}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                            <span className="text-xs font-mono text-gray-600 bg-gray-100 px-2 py-0.5 rounded w-fit">v{subject.version}</span>
                            <span className="text-[10px] text-gray-400 mt-1">
                                {subject.updatedAt ? new Date(subject.updatedAt).toLocaleDateString() : t.na}
                            </span>
                            <span className="text-[10px] text-gray-400">
                                {t.by} {subject.lastModifiedBy || t.system}
                            </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        
                        {showRecycleBin ? (
                            // Restore / Hard Delete
                            <div className="flex justify-end space-x-3">
                                <button onClick={() => handleRestore(subject)} className="text-green-600 hover:text-green-900 flex items-center" title={t.restore}>
                                    <RefreshCcw size={18} />
                                </button>
                                <button onClick={() => handleHardDelete(subject.id)} className="text-red-600 hover:text-red-900 flex items-center" title={t.permanentlyDelete}>
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        ) : (
                            // Edit / Soft Delete
                            <div className="flex justify-end space-x-3">
                                <button onClick={() => startEdit(subject)} className="text-indigo-600 hover:text-indigo-900" aria-label={role === 'Visitor' ? `View ${subject.subject_id}` : `Edit ${subject.subject_id}`}>
                                    {role === 'Visitor' ? <Eye size={18} /> : <Edit size={18} />}
                                </button>
                                {role === 'Admin' && (
                                    <button onClick={() => handleSoftDelete(subject)} className="text-orange-500 hover:text-orange-700" aria-label={t.moveToRecycleBin} title={t.moveToRecycleBin}>
                                        <Trash2 size={18} />
                                    </button>
                                )}
                            </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {filteredSubjects.length > 0 && (
            <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                <div className="text-sm text-gray-700">
                 {t.showing} <span className="font-medium">{filteredSubjects.length}</span> {t.records}
               </div>
            </div>
          )}
        </div>

        {/* Selected Statistics */}
        {!showRecycleBin && selectedSubjects.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-lg mt-6 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">{t.selectedStats}</h3>
              <span className="text-xs text-gray-500">n = {selectedSubjects.length} {t.subjects}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t.measure}</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">{t.nUpper}</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">{t.mean}</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">{t.sd}</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">{t.iqr}</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">{t.range95Low}</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">{t.range95High}</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {selectedStats.map((row) => (
                    <tr key={row.measure}>
                      <td className="px-4 py-2 text-sm text-gray-800">{translateMeasureLabel(row.measure)}</td>
                      <td className="px-4 py-2 text-sm text-gray-600 text-right">{row.n}</td>
                      <td className="px-4 py-2 text-sm text-gray-600 text-right">{formatStat(row.mean)}</td>
                      <td className="px-4 py-2 text-sm text-gray-600 text-right">{formatStat(row.sd)}</td>
                      <td className="px-4 py-2 text-sm text-gray-600 text-right">{formatStat(row.iqr)}</td>
                      <td className="px-4 py-2 text-sm text-gray-600 text-right">{formatStat(row.range95Low)}</td>
                      <td className="px-4 py-2 text-sm text-gray-600 text-right">{formatStat(row.range95High)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Inferential Statistics Module */}
        {!showRecycleBin && (
          <div className="bg-white border border-gray-200 rounded-lg mt-6 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-800">{t.inferentialModule}</h3>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-gray-500">{t.groups}: {inferentialResults.groupNames.length > 0 ? inferentialResults.groupNames.map((name) => translateCategoryValue(name)).join(', ') : '-'}</span>
                <Button
                  variant="secondary"
                  icon={<Download size={16} />}
                  onClick={handleDownloadInferentialCsv}
                  disabled={inferentialResults.rows.length === 0}
                >
                  {t.downloadResultsCsv}
                </Button>
              </div>
            </div>

            <div className="p-4 border-b border-gray-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t.scope}</label>
                  <select
                    value={analysisScope}
                    onChange={(e) => setAnalysisScope(e.target.value as AnalysisScope)}
                    className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm"
                  >
                    <option value="cohort">{t.compareCohorts}</option>
                    <option value="feature">{t.compareFeaturesWithinCohort}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t.featureField}</label>
                  <select
                    value={analysisFeatureField}
                    onChange={(e) => setAnalysisFeatureField(e.target.value as FeatureField)}
                    className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm"
                    disabled={analysisScope !== 'feature'}
                  >
                    <option value="diagnosis">{t.diagnosis}</option>
                    <option value="sex">{t.sex}</option>
                    <option value="affected_side">{t.affectedSide}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t.cohortFilter}</label>
                  <select
                    value={analysisCohortFilter}
                    onChange={(e) => setAnalysisCohortFilter(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm"
                    disabled={analysisScope !== 'feature'}
                  >
                    <option value="ALL">{t.all}</option>
                    {uniqueCohorts.map((cohort) => (
                      <option key={cohort} value={cohort}>{cohort}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t.pairKey}</label>
                  <select
                    value={analysisPairKey}
                    onChange={(e) => setAnalysisPairKey(e.target.value as PairKey)}
                    className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm"
                    disabled={analysisScope !== 'feature'}
                  >
                    <option value="subject_id">subject_id</option>
                    <option value="name_code">name_code</option>
                  </select>
                </div>
              </div>

              {inferentialResults.note && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-3">
                  {translateInferentialNote(inferentialResults.note)}
                </div>
              )}
            </div>

            {inferentialResults.rows.length > 0 && (
              <div className="p-2">
                <div className="overflow-x-auto max-h-[60vh]">
                  <table className="min-w-[980px] w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t.measure}</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">{t.nUpper}</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">{t.normalityP}</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t.test}</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">{t.statistic}</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">{t.df}</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">{t.pUpper}</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">{t.power}</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {inferentialResults.rows.map((row) => (
                        <tr key={row.measure}>
                          <td className="px-3 py-2 text-sm text-gray-800">{translateMeasureLabel(row.measure)}</td>
                          <td className="px-3 py-2 text-sm text-right text-gray-600">{row.n}</td>
                          <td className="px-3 py-2 text-sm text-right text-gray-600">{formatP(row.normalityP)}</td>
                          <td className="px-3 py-2 text-sm text-gray-700">
                            <div>{translateInferentialTest(row.testName)}</div>
                            {row.note && <div className="text-[10px] text-amber-700">{translateInferentialNote(row.note)}</div>}
                          </td>
                          <td className="px-3 py-2 text-sm text-right text-gray-600">{row.statisticLabel}={formatStat(row.statisticValue)}</td>
                          <td className="px-3 py-2 text-sm text-right text-gray-600">{row.df}</td>
                          <td className="px-3 py-2 text-sm text-right text-gray-600">{formatP(row.pValue)}</td>
                          <td className="px-3 py-2 text-sm text-right text-gray-600">{formatPower(row.power)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
          </>
        )}
      </main>

      {/* Modal Forms */}
      {isFormOpen && (
        <SubjectForm 
          initialData={editingSubject}
          onSubmit={editingSubject ? handleEditSubject : handleAddSubject}
          onCancel={() => { setIsFormOpen(false); setEditingSubject(null); }}
          userRole={canViewConfidential ? 'Admin' : role}
          language={language}
          studyProtocols={studyProtocols}
        />
      )}

      {isLoginOpen && (
        <LoginModal 
          onLogin={handleLogin}
          onCancel={() => setIsLoginOpen(false)}
          language={language}
        />
      )}

      {isUserMgmtOpen && (
        <UserManagementModal onClose={() => setIsUserMgmtOpen(false)} language={language} currentUser={currentUser!} />
      )}
    </div>
  );
};

export default App;