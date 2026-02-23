export type UserRole = 'Admin' | 'Researcher' | 'Visitor';

export interface User {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  lastLogin?: string;
  confidentialAccess?: boolean;
  sessionToken?: string;
  adminTier?: 1 | 2;
  assignedAdminId?: string;
  assignedAdminUsername?: string;
}

export enum Sex {
  Male = 'Male',
  Female = 'Female',
  Intersex = 'Intersex',
  Other = 'Other'
}

export enum Handedness {
  Right = 'Right',
  Left = 'Left',
  Ambidextrous = 'Ambidextrous'
}

export enum AffectedSide {
  Right = 'Right',
  Left = 'Left',
  Bilateral = 'Bilateral',
  None = 'None'
}

export interface SubjectHistoryEntry {
  changeId: string;
  operation: 'CREATE' | 'UPDATE' | 'SOFT_DELETE' | 'RESTORE';
  version: number;
  timestamp: string;
  modifiedBy: string;
  expectedVersion?: number;
  mergeApplied?: boolean;
  mergedFields?: string[];
  conflictFields?: string[];
  previousState: Partial<Subject>; // Snapshot of data before change
}

export interface EthicalApprovalFile {
  fileName: string;
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png';
  dataUrl: string;
  uploadedAt: string;
}

export interface StudyProtocol {
  id: string;
  projectName: string;
  projectId: string;
  executionTime: string;
  notes?: string;
  ethicalApproval?: EthicalApprovalFile;
  isDeleted: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lastModifiedBy: string;
  history?: StudyProtocolHistoryEntry[];
}

export interface StudyProtocolHistoryEntry {
  changeId: string;
  operation: 'CREATE' | 'UPDATE' | 'SOFT_DELETE' | 'RESTORE';
  version: number;
  timestamp: string;
  modifiedBy: string;
  expectedVersion?: number;
  mergeApplied?: boolean;
  mergedFields?: string[];
  conflictFields?: string[];
  previousState: Partial<StudyProtocol>;
}

export interface SubjectStaticImageFile {
  fileName: string;
  mimeType: 'image/jpeg' | 'image/png';
  dataUrl: string;
  uploadedAt: string;
}

export interface Subject {
  // Internal System Fields (Database Metadata)
  id: string;
  isDeleted: boolean;     // Soft Delete Flag
  version: number;        // Optimistic Locking / Versioning
  createdAt: string;
  updatedAt: string;
  lastModifiedBy: string;
  history?: SubjectHistoryEntry[]; // Audit Trail

  // Core
  subject_id: string; // "S001" - Internal Study ID
  site_id?: string;
  cohort_group: string;
  enrollment_date: string;
  
  // Identifiable Information (Private)
  real_name?: string; 
  contact_info?: string;

  // Demographics
  name_code: string; // De-identified (e.g., JD-001)
  sex: Sex;
  dob: string; // YYYY-MM-DD
  handedness: Handedness;
  leg_dominance: Handedness;

  // Anthropometrics
  height_cm: number;
  mass_kg: number;
  bmi: number; // Calculated
  shoe_size_eu?: number;
  trunk_length_cm?: number;
  
  // Bilateral Measures (Left/Right)
  limb_length_l_cm?: number;
  limb_length_r_cm?: number;
  thigh_length_l_cm?: number;
  thigh_length_r_cm?: number;
  shank_length_l_cm?: number;
  shank_length_r_cm?: number;
  foot_length_l_cm?: number;
  foot_length_r_cm?: number;
  knee_width_l_cm?: number;
  knee_width_r_cm?: number;
  ankle_width_l_cm?: number;
  ankle_width_r_cm?: number;

  // Clinical / Status
  diagnosis?: string; // KOA, Stroke, CP, Control
  affected_side: AffectedSide;
  severity_scale?: string; // e.g. KL grade
  surgery_history?: string;
  medications?: string;

  // Study Metadata
  consent_status: boolean;
  irb_protocol?: string;
  assessor?: string;
  exclusion_flag: boolean;
  notes?: string;
  staticImages?: SubjectStaticImageFile[];
  staticImage?: SubjectStaticImageFile;
}

export const INITIAL_SUBJECT_STATE: Omit<Subject, 'id' | 'isDeleted' | 'version' | 'createdAt' | 'updatedAt' | 'lastModifiedBy'> = {
  subject_id: '',
  site_id: '',
  cohort_group: 'Control',
  enrollment_date: new Date().toISOString().split('T')[0],
  real_name: '',
  contact_info: '',
  name_code: '',
  sex: Sex.Male,
  dob: '',
  handedness: Handedness.Right,
  leg_dominance: Handedness.Right,
  height_cm: 170,
  mass_kg: 70,
  bmi: 24.2,
  affected_side: AffectedSide.None,
  consent_status: false,
  exclusion_flag: false
};
