import React, { useEffect, useMemo, useState } from 'react';
import { Download, Eye, FileUp, Edit, Trash2 } from 'lucide-react';
import { Button } from './Button';
import { StudyProtocol, User } from '../types';
import { studyProtocolService } from '../services/studyProtocolService';

type AppLanguage = 'en' | 'zh';

type StudyProtocolPageProps = {
  currentUser: User;
  language?: AppLanguage;
  onProtocolsChanged?: (protocols: StudyProtocol[]) => void;
};

const PAGE_TEXT = {
  en: {
    title: 'Study Protocol Management',
    subtitle: 'Create and manage study protocols with ethical approvals.',
    projectName: 'Project Name',
    projectId: 'Project Number / ID',
    executionTime: 'Execution Time (执行时间)',
    notes: 'Project Notes',
    uploadEthical: 'Upload Ethical Approval',
    uploadHint: 'Allowed: PDF, JPEG, PNG',
    selectedFile: 'Selected file',
    createProtocol: 'Create Protocol',
    editProtocol: 'Edit Protocol',
    saveChanges: 'Save Changes',
    cancelEdit: 'Cancel Edit',
    deleteProtocol: 'Delete Protocol',
    deleteConfirm: 'Move this study protocol to recycle state?',
    protocolList: 'Created Study Protocols',
    noData: 'No study protocol yet.',
    ethicalFile: 'Ethical Approval',
    view: 'View',
    download: 'Download',
    none: 'None',
    createdBy: 'Created By',
    actions: 'Actions',
    preview: 'Preview',
    clearPreview: 'Clear Preview',
    readOnlyHint: 'Read-only mode: only Admin can create or edit study protocols. You can view and download ethical approvals.',
    version: 'Version'
  },
  zh: {
    title: '研究方案管理',
    subtitle: '创建并管理研究方案及伦理批件。',
    projectName: '项目名称',
    projectId: '项目编号 / ID',
    executionTime: '执行时间',
    notes: '项目备注',
    uploadEthical: '上传伦理批件',
    uploadHint: '支持：PDF、JPEG、PNG',
    selectedFile: '已选择文件',
    createProtocol: '创建方案',
    editProtocol: '编辑方案',
    saveChanges: '保存修改',
    cancelEdit: '取消编辑',
    deleteProtocol: '删除方案',
    deleteConfirm: '确认删除此研究方案？',
    protocolList: '已创建研究方案',
    noData: '暂无研究方案。',
    ethicalFile: '伦理批件',
    view: '查看',
    download: '下载',
    none: '无',
    createdBy: '创建者',
    actions: '操作',
    preview: '预览',
    clearPreview: '关闭预览',
    readOnlyHint: '只读模式：仅管理员可创建或编辑研究方案。你可以查看并下载伦理批件。',
    version: '版本'
  }
};

const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png']);

const detectMimeTypeFromBytes = (bytes: Uint8Array): 'application/pdf' | 'image/jpeg' | 'image/png' | '' => {
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

  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'application/pdf';
  }

  return '';
};

const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
};

const isSessionError = (message: string) => {
  const text = String(message || '').toLowerCase();
  return text.includes('session expired') || text.includes('missing or invalid authorization token');
};

export const StudyProtocolPage: React.FC<StudyProtocolPageProps> = ({ currentUser, language = 'en', onProtocolsChanged }) => {
  const t = PAGE_TEXT[language];

  const [loading, setLoading] = useState(false);
  const [protocols, setProtocols] = useState<StudyProtocol[]>([]);
  const [projectName, setProjectName] = useState('');
  const [projectId, setProjectId] = useState('');
  const [executionTime, setExecutionTime] = useState('');
  const [notes, setNotes] = useState('');
  const [ethicalFile, setEthicalFile] = useState<File | null>(null);
  const [ethicalFileMimeType, setEthicalFileMimeType] = useState<'application/pdf' | 'image/jpeg' | 'image/png' | null>(null);
  const [previewTarget, setPreviewTarget] = useState<StudyProtocol | null>(null);
  const [editingProtocol, setEditingProtocol] = useState<StudyProtocol | null>(null);

  const canCreate = currentUser.role === 'Admin';

  const loadProtocols = async () => {
    setLoading(true);
    try {
      const all = await studyProtocolService.getAll();
      setProtocols(all);
      onProtocolsChanged?.(all);
    } catch (error: any) {
      if (isSessionError(error?.message)) return;
      alert(error.message || 'Failed to load study protocols.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProtocols();
  }, []);

  const selectedFileName = useMemo(() => ethicalFile?.name || '', [ethicalFile]);

  const resetForm = () => {
    setProjectName('');
    setProjectId('');
    setExecutionTime('');
    setNotes('');
    setEthicalFile(null);
    setEthicalFileMimeType(null);
    setEditingProtocol(null);
  };

  const handlePickFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;

    const fallbackType = String(file.type || '').toLowerCase();
    const buffer = await file.arrayBuffer();
    const detectedMimeType = detectMimeTypeFromBytes(new Uint8Array(buffer));

    if (!detectedMimeType || !allowedTypes.has(detectedMimeType)) {
      alert(language === 'zh' ? '支持：PDF、JPEG、PNG。' : 'Allowed: PDF, JPEG, PNG.');
      event.target.value = '';
      return;
    }

    if (fallbackType && allowedTypes.has(fallbackType) && fallbackType !== detectedMimeType) {
      alert(language === 'zh' ? '支持：PDF、JPEG、PNG。' : 'Allowed: PDF, JPEG, PNG.');
      event.target.value = '';
      return;
    }

    setEthicalFile(file);
    setEthicalFileMimeType(detectedMimeType);
    event.target.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) return;

    try {
      let activeEthicalApproval = editingProtocol?.ethicalApproval;
      if (ethicalFile) {
        if (!ethicalFileMimeType) {
          throw new Error(language === 'zh' ? '无法识别文件类型，请重新选择文件。' : 'Unable to detect file type. Please reselect the file.');
        }
        activeEthicalApproval = {
          fileName: ethicalFile.name,
          mimeType: ethicalFileMimeType,
          dataUrl: await fileToDataUrl(ethicalFile),
          uploadedAt: new Date().toISOString()
        };
      }

      if (editingProtocol) {
        await studyProtocolService.update(
          editingProtocol.id,
          {
            projectName,
            projectId,
            executionTime,
            notes,
            ethicalApproval: activeEthicalApproval,
            version: editingProtocol.version
          },
          currentUser,
          editingProtocol
        );
      } else {
        await studyProtocolService.create(
          {
            projectName,
            projectId,
            executionTime,
            notes,
            ethicalApproval: activeEthicalApproval
          },
          currentUser
        );
      }

      resetForm();
      await loadProtocols();
    } catch (error: any) {
      if (isSessionError(error?.message)) return;
      alert(error.message || (editingProtocol ? 'Failed to update study protocol.' : 'Failed to create study protocol.'));
    }
  };

  const handleStartEdit = (protocol: StudyProtocol) => {
    setEditingProtocol(protocol);
    setProjectName(protocol.projectName);
    setProjectId(protocol.projectId);
    setExecutionTime(protocol.executionTime);
    setNotes(protocol.notes || '');
    setEthicalFile(null);
    setEthicalFileMimeType(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (protocol: StudyProtocol) => {
    if (!canCreate) return;
    if (!window.confirm(t.deleteConfirm)) return;

    try {
      await studyProtocolService.softDelete(protocol.id, currentUser, protocol.version);
      if (editingProtocol?.id === protocol.id) {
        resetForm();
      }
      await loadProtocols();
    } catch (error: any) {
      if (isSessionError(error?.message)) return;
      alert(error.message || 'Failed to delete study protocol.');
    }
  };

  const triggerDownload = (protocol: StudyProtocol) => {
    if (!protocol.ethicalApproval?.dataUrl) return;
    const link = document.createElement('a');
    link.href = protocol.ethicalApproval.dataUrl;
    link.download = protocol.ethicalApproval.fileName || `${protocol.projectId}-ethical-approval`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="text-lg font-semibold text-gray-900">{t.title}</h2>
        <p className="text-sm text-gray-500 mt-1">{t.subtitle}</p>
        {!canCreate && (
          <div className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            {t.readOnlyHint}
          </div>
        )}

        {canCreate && (
          <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 text-sm font-medium text-indigo-700">
              {editingProtocol ? t.editProtocol : t.createProtocol}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t.projectName}</label>
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t.projectId}</label>
              <input
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t.executionTime}</label>
              <input
                value={executionTime}
                onChange={(e) => setExecutionTime(e.target.value)}
                required
                placeholder={language === 'zh' ? '如：2026-01 至 2026-12' : 'e.g. 2026-01 to 2026-12'}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t.uploadEthical}</label>
              <label className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-md text-sm cursor-pointer hover:bg-gray-50">
                <FileUp size={16} />
                <span>{t.uploadEthical}</span>
                <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={handlePickFile} />
              </label>
              <p className="text-xs text-gray-500 mt-1">{t.uploadHint}</p>
              {selectedFileName && <p className="text-xs text-indigo-600 mt-1">{t.selectedFile}: {selectedFileName}</p>}
              {!selectedFileName && editingProtocol?.ethicalApproval?.fileName && (
                <p className="text-xs text-gray-500 mt-1">{t.selectedFile}: {editingProtocol.ethicalApproval.fileName}</p>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">{t.notes}</label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>

            <div className="md:col-span-2 flex justify-end gap-2">
              {editingProtocol && (
                <Button type="button" variant="secondary" onClick={resetForm}>
                  {t.cancelEdit}
                </Button>
              )}
              <Button type="submit" variant="primary">
                {editingProtocol ? t.saveChanges : t.createProtocol}
              </Button>
            </div>
          </form>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-800">{t.protocolList}</h3>
        </div>
        {loading ? (
          <div className="p-4 text-sm text-gray-500">Loading...</div>
        ) : protocols.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">{t.noData}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t.projectName}</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t.projectId}</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t.executionTime}</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t.ethicalFile}</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t.version}</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t.createdBy}</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {protocols.map((protocol) => (
                  <tr key={protocol.id}>
                    <td className="px-4 py-2 text-sm text-gray-800">{protocol.projectName}</td>
                    <td className="px-4 py-2 text-sm text-gray-700">{protocol.projectId}</td>
                    <td className="px-4 py-2 text-sm text-gray-700">{protocol.executionTime}</td>
                    <td className="px-4 py-2 text-sm text-gray-700">{protocol.ethicalApproval?.fileName || t.none}</td>
                    <td className="px-4 py-2 text-sm text-gray-700">v{protocol.version}</td>
                    <td className="px-4 py-2 text-sm text-gray-700">{protocol.createdBy}</td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-2">
                        {canCreate && (
                          <>
                            <Button variant="ghost" onClick={() => handleStartEdit(protocol)} title={t.editProtocol}>
                              <Edit size={16} />
                            </Button>
                            <Button variant="ghost" onClick={() => handleDelete(protocol)} title={t.deleteProtocol}>
                              <Trash2 size={16} />
                            </Button>
                          </>
                        )}
                        {protocol.ethicalApproval && (
                          <>
                            <Button variant="ghost" onClick={() => setPreviewTarget(protocol)} title={t.preview}>
                              <Eye size={16} />
                            </Button>
                            <Button variant="ghost" onClick={() => triggerDownload(protocol)} title={t.download}>
                              <Download size={16} />
                            </Button>
                          </>
                        )}
                        {!protocol.ethicalApproval && !canCreate && (
                          <div className="text-xs text-right text-gray-400">{t.none}</div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {previewTarget?.ethicalApproval && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-800">{t.preview}: {previewTarget.ethicalApproval.fileName}</h4>
            <Button variant="secondary" onClick={() => setPreviewTarget(null)}>{t.clearPreview}</Button>
          </div>

          {previewTarget.ethicalApproval.mimeType === 'application/pdf' ? (
            <iframe
              src={previewTarget.ethicalApproval.dataUrl}
              title="Ethical Approval PDF"
              className="w-full h-[600px] border border-gray-200 rounded-md"
            />
          ) : (
            <img
              src={previewTarget.ethicalApproval.dataUrl}
              alt={previewTarget.ethicalApproval.fileName}
              className="max-h-[600px] w-auto border border-gray-200 rounded-md"
            />
          )}
        </div>
      )}
    </div>
  );
};
