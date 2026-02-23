import React, { useState, useEffect } from 'react';
import { Subject, Sex, Handedness, AffectedSide, INITIAL_SUBJECT_STATE, UserRole, StudyProtocol } from '../types';
import { Button } from './Button';
import { X, Lock, RefreshCw } from 'lucide-react';

interface SubjectFormProps {
  initialData?: Subject | null;
  onSubmit: (data: Omit<Subject, 'id'>) => void;
  onCancel: () => void;
  userRole: UserRole;
  language?: 'en' | 'zh';
  studyProtocols?: StudyProtocol[];
}

const FORM_TEXT = {
  en: {
    editSubject: 'Edit Subject Record',
    newSubject: 'New Subject Entry',
    privacyMode: 'Privacy Mode',
    adminAccess: 'Administrator Access: Full Data Visibility',
    standardAccess: 'Standard Access: Private data is masked after saving.',
    restrictedData: '[Restricted Data]',
    auto: 'Auto',
    manual: 'Manual',
    identityPrivate: 'Identity & Private Data',
    demographics: 'Demographics',
    anthropometrics: 'Anthropometrics',
    segmentLengths: 'Segment Lengths',
    jointWidths: 'Joint Widths',
    clinicalStatus: 'Clinical Status',
    studyMetadata: 'Study Metadata',
    saveSubject: 'Save Subject',
    close: 'Close',
    consentObtained: 'Informed Consent Obtained',
    flagExclusion: 'Flag for Exclusion',
    realName: 'Real Name',
    contactInfo: 'Contact Info',
    realNamePrivate: 'Real Name (Private)',
    contactPrivate: 'Contact Info (Private)',
    deIdentifiedCode: 'De-identified Code (Auto-generated)',
    subjectId: 'Subject ID (Study ID)',
    siteId: 'Site ID',
    cohortGroup: 'Cohort / Group',
    enrollmentDate: 'Enrollment Date',
    sex: 'Sex',
    dateOfBirth: 'Date of Birth',
    handedness: 'Handedness',
    legDominance: 'Leg Dominance',
    height: 'Height',
    mass: 'Mass',
    shoeSize: 'Shoe Size',
    trunkLength: 'Trunk Length',
    thighR: 'Thigh Length (R)',
    thighL: 'Thigh Length (L)',
    shankR: 'Shank Length (R)',
    shankL: 'Shank Length (L)',
    footR: 'Foot Length (R)',
    footL: 'Foot Length (L)',
    kneeR: 'Knee Width (R)',
    kneeL: 'Knee Width (L)',
    ankleR: 'Ankle Width (R)',
    ankleL: 'Ankle Width (L)',
    diagnosisCondition: 'Diagnosis / Condition',
    affectedSide: 'Affected Side',
    severityScale: 'Severity Scale (e.g. KL Grade)',
    surgeryHistory: 'Surgery History',
    medications: 'Medications',
    irbProtocol: 'IRB Protocol #',
    selectProtocol: 'Select Study ID / Project ID',
    assessorName: 'Assessor Name',
    generalNotes: 'General Notes',
    subjectImage: 'Static Subject Image',
    uploadImage: 'Upload Image',
    imageHint: 'Allowed: JPEG, PNG',
    selectedImage: 'Selected image',
    currentImage: 'Current image',
    invalidImage: 'Image must be a real JPEG or PNG file.',
    removeImage: 'Remove Image',
    imageWillBeRemoved: 'Current image will be removed on save.'
  },
  zh: {
    editSubject: '编辑受试者记录',
    newSubject: '新建受试者录入',
    privacyMode: '隐私模式',
    adminAccess: '管理员权限：可见全部数据',
    standardAccess: '普通权限：保存后将屏蔽隐私数据。',
    restrictedData: '[受限数据]',
    auto: '自动',
    manual: '手动',
    identityPrivate: '身份与隐私信息',
    demographics: '人口学信息',
    anthropometrics: '人体测量',
    segmentLengths: '节段长度',
    jointWidths: '关节宽度',
    clinicalStatus: '临床状态',
    studyMetadata: '研究元数据',
    saveSubject: '保存受试者',
    close: '关闭',
    consentObtained: '已获得知情同意',
    flagExclusion: '标记为排除',
    realName: '真实姓名',
    contactInfo: '联系方式',
    realNamePrivate: '真实姓名（隐私）',
    contactPrivate: '联系方式（隐私）',
    deIdentifiedCode: '去标识编码（自动生成）',
    subjectId: '受试者ID（研究ID）',
    siteId: '中心ID',
    cohortGroup: '队列 / 分组',
    enrollmentDate: '入组日期',
    sex: '性别',
    dateOfBirth: '出生日期',
    handedness: '利手',
    legDominance: '优势腿',
    height: '身高',
    mass: '体重',
    shoeSize: '鞋码',
    trunkLength: '躯干长度',
    thighR: '大腿长度（右）',
    thighL: '大腿长度（左）',
    shankR: '小腿长度（右）',
    shankL: '小腿长度（左）',
    footR: '足长（右）',
    footL: '足长（左）',
    kneeR: '膝宽（右）',
    kneeL: '膝宽（左）',
    ankleR: '踝宽（右）',
    ankleL: '踝宽（左）',
    diagnosisCondition: '诊断 / 病情',
    affectedSide: '患侧',
    severityScale: '严重程度量表（如 KL 分级）',
    surgeryHistory: '手术史',
    medications: '用药情况',
    irbProtocol: 'IRB 方案编号',
    selectProtocol: '选择 Study ID / Project ID',
    assessorName: '评估者姓名',
    generalNotes: '一般备注',
    subjectImage: '受试者静态图像',
    uploadImage: '上传图像',
    imageHint: '支持：JPEG、PNG',
    selectedImage: '已选择图像',
    currentImage: '当前图像',
    invalidImage: '图像必须是有效的 JPEG 或 PNG 文件。',
    removeImage: '移除图像',
    imageWillBeRemoved: '保存后将移除当前图像。'
  }
};

const allowedImageTypes = new Set(['image/jpeg', 'image/png']);

const detectImageMimeTypeFromBytes = (bytes: Uint8Array): 'image/jpeg' | 'image/png' | '' => {
  if (!bytes || bytes.length < 4) return '';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  return '';
};

const fileToDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Failed to read file.'));
  reader.readAsDataURL(file);
});

const FormSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="border-b border-gray-200 pb-4 mb-4">
    <h4 className="text-md font-semibold text-indigo-700 mb-3 uppercase tracking-wide text-xs">{title}</h4>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {children}
    </div>
  </div>
);

const InputField: React.FC<{ 
  label: string; 
  name: keyof Subject; 
  type?: string; 
  value: any; 
  onChange: (e: any) => void; 
  required?: boolean; 
  colSpan?: number;
  disabled?: boolean;
  unit?: string;
  placeholder?: string;
}> = ({ label, name, type = "text", value, onChange, required, colSpan = 1, disabled, unit, placeholder }) => (
  <div className={colSpan === 2 ? "sm:col-span-2" : ""}>
    <label className="block text-xs font-medium text-gray-500 mb-1">
      {label} {unit && <span className="text-gray-400 font-normal">({unit})</span>}
    </label>
    <div className="relative rounded-md shadow-sm">
      <input
        type={type}
        name={name}
        value={value ?? ''}
        onChange={onChange}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        step={type === 'number' ? "0.1" : undefined}
        className={`block w-full border rounded-md shadow-sm py-1.5 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm ${
          disabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200' : 'border-gray-300'
        }`}
      />
      {unit && !disabled && (
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
          <span className="text-gray-400 sm:text-xs">{unit}</span>
        </div>
      )}
    </div>
  </div>
);

export const SubjectForm: React.FC<SubjectFormProps> = ({ initialData, onSubmit, onCancel, userRole, language = 'en', studyProtocols = [] }) => {
  const t = FORM_TEXT[language];
  const labelSex = (value: Sex) => {
    if (language === 'en') return value;
    if (value === Sex.Male) return '男';
    if (value === Sex.Female) return '女';
    if (value === Sex.Intersex) return '双性';
    return '其他';
  };
  const labelHandedness = (value: Handedness) => {
    if (language === 'en') return value;
    if (value === Handedness.Right) return '右';
    if (value === Handedness.Left) return '左';
    return '双手';
  };
  const labelAffected = (value: AffectedSide) => {
    if (language === 'en') return value;
    if (value === AffectedSide.Right) return '右侧';
    if (value === AffectedSide.Left) return '左侧';
    if (value === AffectedSide.Bilateral) return '双侧';
    return '无';
  };
  const [formData, setFormData] = useState<Omit<Subject, 'id'>>({ 
    ...INITIAL_SUBJECT_STATE,
    // Provide default system fields to satisfy Omit<Subject, 'id'> type
    isDeleted: false,
    version: 0,
    createdAt: '',
    updatedAt: '',
    lastModifiedBy: ''
  });
  const [autoGenCode, setAutoGenCode] = useState(true);
  const [subjectImageFiles, setSubjectImageFiles] = useState<File[]>([]);
  const [subjectImageMimeTypes, setSubjectImageMimeTypes] = useState<Array<'image/jpeg' | 'image/png'>>([]);
  const [removeSubjectImage, setRemoveSubjectImage] = useState(false);

  // Researchers can enter confidential data on initial creation, but cannot access it later.
  const isPrivateDataRestricted = userRole !== 'Admin' && !!initialData;

  useEffect(() => {
    if (initialData) {
      const { id, ...rest } = initialData;
      setFormData(rest);
      setSubjectImageFiles([]);
      setSubjectImageMimeTypes([]);
      setRemoveSubjectImage(false);
    }
  }, [initialData]);

  // Auto-calculate BMI
  useEffect(() => {
    if (formData.height_cm > 0 && formData.mass_kg > 0) {
      const heightM = formData.height_cm / 100;
      const bmi = Number((formData.mass_kg / (heightM * heightM)).toFixed(1));
      setFormData(prev => ({ ...prev, bmi }));
    }
  }, [formData.height_cm, formData.mass_kg]);

  // Auto-generate Name Code from Real Name
  useEffect(() => {
    if (autoGenCode && !isPrivateDataRestricted && formData.real_name) {
      const nameParts = formData.real_name.trim().split(' ');
      if (nameParts.length > 0) {
        const initials = nameParts.map(p => p[0]).join('').toUpperCase().substring(0, 3);
        const randomDigits = Math.floor(100 + Math.random() * 900);
        setFormData(prev => ({ ...prev, name_code: `${initials}-${randomDigits}` }));
      }
    }
  }, [formData.real_name, autoGenCode, isPrivateDataRestricted]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let finalValue: any = value;

    if (type === 'checkbox') {
      finalValue = (e.target as HTMLInputElement).checked;
    } else if (type === 'number') {
      finalValue = value === '' ? undefined : Number(value);
    }

    setFormData(prev => ({
      ...prev,
      [name]: finalValue
    }));
  };

  const handleSubjectImagePick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const validFiles: File[] = [];
    const validTypes: Array<'image/jpeg' | 'image/png'> = [];
    for (const file of files) {
      const fallbackType = String(file.type || '').toLowerCase();
      const buffer = await file.arrayBuffer();
      const detected = detectImageMimeTypeFromBytes(new Uint8Array(buffer));
      if (!detected || !allowedImageTypes.has(detected)) {
        alert(t.invalidImage);
        event.target.value = '';
        return;
      }
      if (fallbackType && allowedImageTypes.has(fallbackType) && fallbackType !== detected) {
        alert(t.invalidImage);
        event.target.value = '';
        return;
      }
      validFiles.push(file);
      validTypes.push(detected);
    }

    setSubjectImageFiles(prev => [...prev, ...validFiles]);
    setSubjectImageMimeTypes(prev => [...prev, ...validTypes]);
    setRemoveSubjectImage(false);
    event.target.value = '';
  };

  const handleRemoveSubjectImage = () => {
    setSubjectImageFiles([]);
    setSubjectImageMimeTypes([]);
    setRemoveSubjectImage(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let next = { ...formData };
    if (removeSubjectImage) {
      next = {
        ...next,
        staticImages: null as any
      };
    } else if (subjectImageFiles.length > 0) {
      if (subjectImageFiles.length !== subjectImageMimeTypes.length) {
        alert(t.invalidImage);
        return;
      }
      const dataUrls = await Promise.all(subjectImageFiles.map((file) => fileToDataUrl(file)));
      const existingImages = formData.staticImages || (formData.staticImage ? [formData.staticImage] : []);
      next = {
        ...next,
        staticImages: [
          ...existingImages,
          ...subjectImageFiles.map((file, index) => ({
            fileName: file.name,
            mimeType: subjectImageMimeTypes[index],
            dataUrl: dataUrls[index],
            uploadedAt: new Date().toISOString()
          }))
        ]
      };
    }
    onSubmit(next);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onCancel}></div>
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
          <div className="bg-white flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <div>
                <h3 className="text-lg leading-6 font-medium text-gray-900 flex items-center gap-2">
                  {initialData ? t.editSubject : t.newSubject}
                  {isPrivateDataRestricted && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800"><Lock size={12} className="mr-1"/> {t.privacyMode}</span>}
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  {userRole === 'Admin' ? t.adminAccess : t.standardAccess}
                </p>
              </div>
              <button onClick={onCancel} className="text-gray-400 hover:text-gray-500">
                <X size={24} />
              </button>
            </div>
            
            {/* Scrollable Form Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <form id="subject-form" onSubmit={handleSubmit}>
                
                {/* 1. Core Information */}
                <FormSection title={t.identityPrivate}>
                  <div className="sm:col-span-2 bg-indigo-50 p-4 rounded-md border border-indigo-100 mb-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {isPrivateDataRestricted ? (
                        <>
                           <div className="sm:col-span-1">
                              <label className="block text-xs font-medium text-gray-500 mb-1">{t.realName}</label>
                              <div className="block w-full border border-gray-200 bg-gray-100 text-gray-400 rounded-md py-1.5 px-3 sm:text-sm italic">
                                {t.restrictedData}
                              </div>
                           </div>
                           <div className="sm:col-span-1">
                              <label className="block text-xs font-medium text-gray-500 mb-1">{t.contactInfo}</label>
                              <div className="block w-full border border-gray-200 bg-gray-100 text-gray-400 rounded-md py-1.5 px-3 sm:text-sm italic">
                                {t.restrictedData}
                              </div>
                           </div>
                        </>
                      ) : (
                        <>
                          <InputField label={t.realNamePrivate} name="real_name" value={formData.real_name} onChange={handleChange} placeholder="e.g. John Doe" />
                          <InputField label={t.contactPrivate} name="contact_info" value={formData.contact_info} onChange={handleChange} placeholder="Email or Phone" />
                        </>
                      )}
                      
                      <div className="relative">
                         <InputField label={t.deIdentifiedCode} name="name_code" value={formData.name_code} onChange={handleChange} required />
                         {!isPrivateDataRestricted && (
                           <button type="button" onClick={() => setAutoGenCode(!autoGenCode)} className={`absolute top-0 right-0 text-xs ${autoGenCode ? 'text-indigo-600' : 'text-gray-400'} flex items-center`}>
                             <RefreshCw size={10} className="mr-1" /> {autoGenCode ? t.auto : t.manual}
                           </button>
                         )}
                      </div>
                      <InputField label={t.subjectId} name="subject_id" value={formData.subject_id} onChange={handleChange} required placeholder="e.g. S001"/>
                    </div>
                  </div>

                  <InputField label={t.siteId} name="site_id" value={formData.site_id} onChange={handleChange} />
                  <InputField label={t.cohortGroup} name="cohort_group" value={formData.cohort_group} onChange={handleChange} required />
                  <InputField label={t.enrollmentDate} name="enrollment_date" type="date" value={formData.enrollment_date} onChange={handleChange} />
                </FormSection>

                {/* 2. Demographics */}
                <FormSection title={t.demographics}>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{t.sex}</label>
                    <select name="sex" value={formData.sex} onChange={handleChange} className="block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                      {Object.values(Sex).map(v => <option key={v} value={v}>{labelSex(v)}</option>)}
                    </select>
                  </div>
                  <InputField label={t.dateOfBirth} name="dob" type="date" value={formData.dob} onChange={handleChange} />
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{t.handedness}</label>
                    <select name="handedness" value={formData.handedness} onChange={handleChange} className="block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                      {Object.values(Handedness).map(v => <option key={v} value={v}>{labelHandedness(v)}</option>)}
                    </select>
                  </div>
                   <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{t.legDominance}</label>
                    <select name="leg_dominance" value={formData.leg_dominance} onChange={handleChange} className="block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                      {Object.values(Handedness).map(v => <option key={v} value={v}>{labelHandedness(v)}</option>)}
                    </select>
                  </div>
                </FormSection>

                {/* 3. Anthropometrics */}
                <FormSection title={t.anthropometrics}>
                  <InputField label={t.height} name="height_cm" type="number" value={formData.height_cm} onChange={handleChange} required unit="cm" />
                  <InputField label={t.mass} name="mass_kg" type="number" value={formData.mass_kg} onChange={handleChange} required unit="kg" />
                  <InputField label="BMI" name="bmi" type="number" value={formData.bmi} onChange={handleChange} unit="kg/m²" />
                  <InputField label={t.shoeSize} name="shoe_size_eu" type="number" value={formData.shoe_size_eu} onChange={handleChange} unit="EU" />
                  <InputField label={t.trunkLength} name="trunk_length_cm" type="number" value={formData.trunk_length_cm} onChange={handleChange} unit="cm" />
                  
                  <div className="sm:col-span-2 grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-md border border-gray-200 mt-2">
                    <p className="col-span-2 text-xs font-bold text-gray-500 uppercase">{t.segmentLengths}</p>
                    <InputField label={t.thighR} name="thigh_length_r_cm" type="number" value={formData.thigh_length_r_cm} onChange={handleChange} unit="cm" />
                    <InputField label={t.thighL} name="thigh_length_l_cm" type="number" value={formData.thigh_length_l_cm} onChange={handleChange} unit="cm" />
                    <InputField label={t.shankR} name="shank_length_r_cm" type="number" value={formData.shank_length_r_cm} onChange={handleChange} unit="cm" />
                    <InputField label={t.shankL} name="shank_length_l_cm" type="number" value={formData.shank_length_l_cm} onChange={handleChange} unit="cm" />
                    <InputField label={t.footR} name="foot_length_r_cm" type="number" value={formData.foot_length_r_cm} onChange={handleChange} unit="cm" />
                    <InputField label={t.footL} name="foot_length_l_cm" type="number" value={formData.foot_length_l_cm} onChange={handleChange} unit="cm" />
                  </div>
                  
                  <div className="sm:col-span-2 grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-md border border-gray-200 mt-2">
                    <p className="col-span-2 text-xs font-bold text-gray-500 uppercase">{t.jointWidths}</p>
                    <InputField label={t.kneeR} name="knee_width_r_cm" type="number" value={formData.knee_width_r_cm} onChange={handleChange} unit="cm" />
                    <InputField label={t.kneeL} name="knee_width_l_cm" type="number" value={formData.knee_width_l_cm} onChange={handleChange} unit="cm" />
                    <InputField label={t.ankleR} name="ankle_width_r_cm" type="number" value={formData.ankle_width_r_cm} onChange={handleChange} unit="cm" />
                    <InputField label={t.ankleL} name="ankle_width_l_cm" type="number" value={formData.ankle_width_l_cm} onChange={handleChange} unit="cm" />
                  </div>
                </FormSection>

                {/* 4. Clinical Status */}
                <FormSection title={t.clinicalStatus}>
                  <InputField label={t.diagnosisCondition} name="diagnosis" value={formData.diagnosis} onChange={handleChange} colSpan={2} />
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{t.affectedSide}</label>
                    <select name="affected_side" value={formData.affected_side} onChange={handleChange} className="block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                      {Object.values(AffectedSide).map(v => <option key={v} value={v}>{labelAffected(v)}</option>)}
                    </select>
                  </div>
                  <InputField label={t.severityScale} name="severity_scale" value={formData.severity_scale} onChange={handleChange} />
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">{t.surgeryHistory}</label>
                     <textarea name="surgery_history" rows={2} value={formData.surgery_history ?? ''} onChange={handleChange} className="block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 focus:outline-none focus:ring-indigo-500 sm:text-sm"/>
                  </div>
                   <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">{t.medications}</label>
                     <textarea name="medications" rows={2} value={formData.medications ?? ''} onChange={handleChange} className="block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 focus:outline-none focus:ring-indigo-500 sm:text-sm"/>
                  </div>
                </FormSection>

                {/* 5. Study Metadata */}
                 <FormSection title={t.studyMetadata}>
                   <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{t.irbProtocol}</label>
                    <select
                      name="irb_protocol"
                      value={formData.irb_protocol ?? ''}
                      onChange={handleChange}
                      className="block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    >
                      <option value="">{t.selectProtocol}</option>
                      {studyProtocols.map((protocol) => (
                        <option key={protocol.id} value={protocol.projectId}>
                          {protocol.projectId} - {protocol.projectName}
                        </option>
                      ))}
                    </select>
                   </div>
                   <InputField label={t.assessorName} name="assessor" value={formData.assessor} onChange={handleChange} />
                   
                   <div className="flex items-center mt-4">
                      <input id="consent_status" name="consent_status" type="checkbox" checked={formData.consent_status} onChange={handleChange} className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded" />
                      <label htmlFor="consent_status" className="ml-2 block text-sm text-gray-900">{t.consentObtained}</label>
                   </div>
                   <div className="flex items-center mt-2">
                      <input id="exclusion_flag" name="exclusion_flag" type="checkbox" checked={formData.exclusion_flag} onChange={handleChange} className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded" />
                      <label htmlFor="exclusion_flag" className="ml-2 block text-sm text-gray-900">{t.flagExclusion}</label>
                   </div>

                   <div className="sm:col-span-2 mt-4">
                     <label className="block text-xs font-medium text-gray-500 mb-1">{t.subjectImage}</label>
                     <label className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-md text-sm cursor-pointer hover:bg-gray-50">
                       <span>{t.uploadImage}</span>
                       <input type="file" multiple className="hidden" accept=".jpg,.jpeg,.png" onChange={handleSubjectImagePick} />
                     </label>
                     <p className="text-xs text-gray-500 mt-1">{t.imageHint}</p>
                     {subjectImageFiles.length > 0 && (
                       <div className="text-xs text-indigo-600 mt-1">
                         <div>{t.selectedImage}:</div>
                         {subjectImageFiles.map((file, index) => (
                           <div key={`${file.name}-${index}`}>{file.name}</div>
                         ))}
                       </div>
                     )}
                     {subjectImageFiles.length === 0 && removeSubjectImage && (
                       <p className="text-xs text-red-600 mt-1">{t.imageWillBeRemoved}</p>
                     )}
                     {subjectImageFiles.length === 0 && (formData.staticImages?.length || (formData.staticImage ? 1 : 0)) > 0 && (
                       <div className="text-xs text-gray-500 mt-1">
                         <div>{t.currentImage}:</div>
                         {(formData.staticImages || (formData.staticImage ? [formData.staticImage] : [])).map((image, index) => (
                           <div key={`${image.fileName}-${index}`}>{image.fileName}</div>
                         ))}
                       </div>
                     )}
                     {(subjectImageFiles.length > 0 || (formData.staticImages?.length || (formData.staticImage ? 1 : 0)) > 0) && (
                       <Button type="button" variant="secondary" className="mt-2" onClick={handleRemoveSubjectImage}>
                         {t.removeImage}
                       </Button>
                     )}
                     {subjectImageFiles.length === 0 && (formData.staticImages || (formData.staticImage ? [formData.staticImage] : [])).map((image, index) => (
                       <img key={`existing-${image.fileName}-${index}`} src={image.dataUrl} alt={image.fileName} className="mt-2 max-h-36 rounded border border-gray-200" />
                     ))}
                     {subjectImageFiles.length > 0 && subjectImageFiles.map((file, index) => (
                       <img key={`new-${file.name}-${index}`} src={URL.createObjectURL(file)} alt={file.name} className="mt-2 max-h-36 rounded border border-gray-200" />
                     ))}
                  </div>

                   <div className="sm:col-span-2 mt-4">
                     <label className="block text-xs font-medium text-gray-500 mb-1">{t.generalNotes}</label>
                     <textarea name="notes" rows={3} value={formData.notes ?? ''} onChange={handleChange} className="block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-3 focus:outline-none focus:ring-indigo-500 sm:text-sm"/>
                  </div>
                </FormSection>

              </form>
            </div>

            {/* Footer */}
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 sm:flex sm:flex-row-reverse">
              {userRole !== 'Visitor' && (
                <Button type="submit" form="subject-form" variant="primary" className="w-full sm:w-auto sm:ml-3">
                  {t.saveSubject}
                </Button>
              )}
              <Button type="button" onClick={onCancel} variant="secondary" className="mt-3 w-full sm:w-auto sm:mt-0">
                {t.close}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};