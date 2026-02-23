
import React, { useState, useRef, useEffect } from 'react';
import { Subject, User, INITIAL_SUBJECT_STATE, Sex, Handedness, AffectedSide } from './types';
import { authService } from './services/authService';
import { dataService } from './services/dataService';
import { SubjectForm } from './components/SubjectForm';
import { StatsDashboard } from './components/StatsDashboard';
import { Button } from './components/Button';
import { LoginModal } from './components/LoginModal';
import { UserManagementModal } from './components/UserManagementModal';
import { USE_CLOUD_STORAGE } from './config';
import { 
  Plus, Upload, Download, Trash2, Edit, Activity, FileText,
  Search, AlertCircle, Shield, Eye, User as UserIcon,
  LogOut, LogIn, Settings, Database, RefreshCcw, FileSpreadsheet, FileUp, Cloud
} from 'lucide-react';

const CSV_HEADERS = [
  "subject_id", "real_name", "contact_info", "site_id", "cohort_group",
  "enrollment_date", "name_code", "sex", "dob", "handedness", "leg_dominance",
  "height_cm", "mass_kg", "bmi", "shoe_size_eu", "trunk_length_cm",
  "limb_length_l_cm", "limb_length_r_cm", "thigh_length_l_cm", "thigh_length_r_cm",
  "shank_length_l_cm", "shank_length_r_cm", "foot_length_l_cm", "foot_length_r_cm",
  "knee_width_l_cm", "knee_width_r_cm", "ankle_width_l_cm", "ankle_width_r_cm",
  "diagnosis", "affected_side", "severity_scale", "surgery_history", "medications",
  "consent_status", "irb_protocol", "assessor", "exclusion_flag", "notes"
];

const App: React.FC = () => {
  // --- State ---
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // UI State
  const [isLoading, setIsLoading] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isUserMgmtOpen, setIsUserMgmtOpen] = useState(false);
  const [showRecycleBin, setShowRecycleBin] = useState(false);
  
  // Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dbInputRef = useRef<HTMLInputElement>(null);

  // --- Initialization ---
  useEffect(() => {
    const user = authService.getCurrentUser();
    if (user) {
      setCurrentUser(user);
    }
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      let data;
      if (showRecycleBin) {
        data = await dataService.getDeleted();
      } else {
        data = await dataService.getAll(false);
      }
      setSubjects(data);
    } catch (error) {
      console.error("Failed to load data", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [showRecycleBin]);

  // --- Auth Handlers ---
  const handleLogin = (user: User) => {
    setCurrentUser(user);
    setIsLoginOpen(false);
    loadData();
  };

  const handleLogout = () => {
    authService.logout();
    setCurrentUser(null);
    setSubjects([]); // Clear data on logout
  };

  // --- CRUD Operations ---
  const handleAddSubject = async (data: Omit<Subject, 'id'>) => {
    if (!currentUser) return;
    try {
      await dataService.create(data as any, currentUser);
      await loadData();
      setIsFormOpen(false);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleEditSubject = async (data: Omit<Subject, 'id'>) => {
    if (!editingSubject || !currentUser) return;
    try {
      await dataService.update(editingSubject.id, data, currentUser);
      setEditingSubject(null);
      setIsFormOpen(false);
      await loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleSoftDelete = async (id: string) => {
    if (!currentUser) return;
    if (window.confirm("Move this record to the Recycle Bin?")) {
      try {
        await dataService.softDelete(id, currentUser);
        await loadData();
      } catch (e: any) {
        alert(e.message);
      }
    }
  };

  const handleRestore = async (id: string) => {
    if (!currentUser) return;
    try {
      await dataService.restore(id, currentUser);
      await loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleHardDelete = async (id: string) => {
    if (window.confirm("PERMANENTLY DELETE? This cannot be undone.")) {
      try {
        await dataService.hardDelete(id);
        await loadData();
      } catch (e: any) {
        alert(e.message);
      }
    }
  };

  const startEdit = (subject: Subject) => {
    setEditingSubject(subject);
    setIsFormOpen(true);
  };

  // --- Database Operations ---
  const handleBackupDB = async () => {
    try {
      const dataStr = await dataService.generateBackup();
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `biomech_FULL_BACKUP_${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch(e: any) {
      alert("Backup failed: " + e.message);
    }
  };

  const handleRestoreDBClick = () => {
    if (window.confirm("WARNING: Restoring a database will OVERWRITE all current data. Continue?")) {
      dbInputRef.current?.click();
    }
  };

  const handleRestoreDBFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        await dataService.restoreBackup(content);
        alert("Database restored successfully. Reloading...");
        window.location.reload();
      } catch (err: any) {
        alert("Restore failed: " + err.message);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // --- CSV Import/Export ---
  const handleDownloadTemplate = () => {
    const headers = CSV_HEADERS.join(",");
    const sampleValues = [
      "S-EXAMPLE", "John Doe", "john@example.com", "SITE-01", "Control", "2024-01-01", "JD-999",
      "Male", "1990-01-01", "Right", "Right", "180", "75", "23.1",
      "42", "50", "85", "85", "45", "45", "40", "40", "25", "25", "10", "10", "7", "7",
      "Healthy", "None", "0", "None", "None", "true", "IRB-2024-001", "Dr. Smith", "false", "Sample note"
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

  const handleCSVImportClick = () => fileInputRef.current?.click();

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
        if (headers.length < 5) throw new Error("CSV seems to have too few columns.");

        let successCount = 0;
        let errors = [];

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            if (values.length === 0) continue;
            const row: any = {};
            headers.forEach((h, idx) => { if(idx < values.length) row[h] = values[idx]; });

            if (!row.subject_id || !row.cohort_group) {
                errors.push(`Row ${i+1}: Missing Subject ID or Cohort.`);
                continue;
            }

            try {
                // ... (Parsing logic remains same, just ensuring create call is awaited)
                let nameCode = row.name_code;
                if (!nameCode && row.real_name) {
                    const parts = row.real_name.split(' ');
                    const initials = parts.map((p: string) => p[0]).join('').toUpperCase().substring(0,3);
                    nameCode = `${initials}-${Math.floor(100 + Math.random() * 900)}`;
                }
                const num = (v: string) => (v && !isNaN(Number(v))) ? Number(v) : undefined;
                const bool = (v: string) => v?.toLowerCase() === 'true' || v === '1';
                const h = num(row.height_cm) || 0;
                const m = num(row.mass_kg) || 0;
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
                    sex: Object.values(Sex).includes(row.sex) ? row.sex : Sex.Other,
                    dob: row.dob,
                    handedness: Object.values(Handedness).includes(row.handedness) ? row.handedness : Handedness.Right,
                    leg_dominance: Object.values(Handedness).includes(row.leg_dominance) ? row.leg_dominance : Handedness.Right,
                    height_cm: h, mass_kg: m, bmi: bmi,
                    shoe_size_eu: num(row.shoe_size_eu), trunk_length_cm: num(row.trunk_length_cm),
                    limb_length_l_cm: num(row.limb_length_l_cm), limb_length_r_cm: num(row.limb_length_r_cm),
                    thigh_length_l_cm: num(row.thigh_length_l_cm), thigh_length_r_cm: num(row.thigh_length_r_cm),
                    shank_length_l_cm: num(row.shank_length_l_cm), shank_length_r_cm: num(row.shank_length_r_cm),
                    foot_length_l_cm: num(row.foot_length_l_cm), foot_length_r_cm: num(row.foot_length_r_cm),
                    knee_width_l_cm: num(row.knee_width_l_cm), knee_width_r_cm: num(row.knee_width_r_cm),
                    ankle_width_l_cm: num(row.ankle_width_l_cm), ankle_width_r_cm: num(row.ankle_width_r_cm),
                    diagnosis: row.diagnosis,
                    affected_side: Object.values(AffectedSide).includes(row.affected_side) ? row.affected_side : AffectedSide.None,
                    severity_scale: row.severity_scale, surgery_history: row.surgery_history, medications: row.medications,
                    consent_status: bool(row.consent_status), irb_protocol: row.irb_protocol,
                    assessor: row.assessor, exclusion_flag: bool(row.exclusion_flag), notes: row.notes
                };
                await dataService.create(newSubject as any, currentUser);
                successCount++;
            } catch (err: any) {
                errors.push(`Row ${i + 1}: ${err.message}`);
            }
        }
        await loadData();
        let msg = `Import complete. ${successCount} records added.`;
        if (errors.length > 0) msg += `\n\nErrors:\n${errors.slice(0, 5).join('\n')}`;
        alert(msg);
      } catch (err: any) {
        alert("Import Failed: " + err.message);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleExportView = () => {
    const role = currentUser?.role || 'Visitor';
    const exportData = subjects.map(s => {
      if (role === 'Admin') return s;
      const { real_name, contact_info, ...deidentified } = s;
      return deidentified;
    });
    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `biomech_export_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Filtering ---
  const role = currentUser?.role || 'Visitor';
  const filteredSubjects = subjects.filter(s => 
    s.subject_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.cohort_group.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.diagnosis?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (role === 'Admin' && s.real_name?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="relative h-12 w-12 flex-shrink-0 p-1">
                <Activity className="absolute inset-0 m-auto h-8 w-8 text-indigo-600" />
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
                <p className="text-sm text-gray-500 flex items-center whitespace-nowrap leading-tight">
                  Baseline Data Manager by Hippony Lab
                  {USE_CLOUD_STORAGE && <span className="ml-2 px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] flex items-center"><Cloud size={10} className="mr-1"/> Cloud Mode</span>}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {currentUser ? (
                 <div className="flex items-center space-x-3">
                     {/* Admin Database Tools */}
                     {currentUser.role === 'Admin' && (
                       <div className="flex items-center bg-gray-100 rounded-lg p-1 mr-2 space-x-1">
                          <button onClick={() => setIsUserMgmtOpen(true)} className="p-1.5 text-gray-600 hover:text-indigo-600 rounded-md hover:bg-white transition-all" title="Manage Users">
                            <Settings size={18} />
                          </button>
                          <div className="w-px h-4 bg-gray-300"></div>
                          <button onClick={handleBackupDB} className="p-1.5 text-gray-600 hover:text-indigo-600 rounded-md hover:bg-white transition-all" title="Full DB Backup (Download)">
                            <Database size={18} />
                          </button>
                          <button onClick={handleRestoreDBClick} className="p-1.5 text-gray-600 hover:text-red-600 rounded-md hover:bg-white transition-all" title="Restore DB (Overwrite)">
                             <Upload size={18} />
                          </button>
                          <input type="file" ref={dbInputRef} onChange={handleRestoreDBFile} className="hidden" accept=".json"/>
                       </div>
                     )}
                     
                     <div className="flex items-center bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100">
                        <UserIcon size={16} className="text-indigo-600 mr-2" />
                        <div className="flex flex-col text-right mr-2">
                          <span className="text-xs font-semibold text-indigo-900">{currentUser.username}</span>
                          <span className="text-[10px] text-indigo-500 uppercase tracking-wide">{currentUser.role}</span>
                        </div>
                        <button onClick={handleLogout} className="ml-2 text-gray-400 hover:text-red-500 transition-colors" title="Sign Out">
                          <LogOut size={16} />
                        </button>
                     </div>
                 </div>
              ) : (
                <Button variant="secondary" icon={<LogIn size={16}/>} onClick={() => setIsLoginOpen(true)}>
                  Sign In
                </Button>
              )}

              <div className="h-6 w-px bg-gray-300 mx-2"></div>
              <div className="flex items-center space-x-2">
                <Button variant="ghost" onClick={handleDownloadTemplate} title="Download CSV Template">
                  <FileSpreadsheet size={18} className="text-green-600" />
                </Button>
                
                {currentUser && role !== 'Visitor' && (
                  <>
                    <Button variant="ghost" onClick={handleCSVImportClick} title="Import CSV Data">
                       <FileUp size={18} className="text-blue-600" />
                    </Button>
                    <input type="file" ref={fileInputRef} onChange={handleCSVFileChange} className="hidden" accept=".csv" />
                  </>
                )}
                
                <Button variant="ghost" icon={<Download size={18}/>} onClick={handleExportView} disabled={subjects.length === 0} title="Export Visible View">
                  Export
                </Button>
                
                {currentUser && role !== 'Visitor' && !showRecycleBin && (
                  <Button variant="primary" icon={<Plus size={18}/>} onClick={() => { setEditingSubject(null); setIsFormOpen(true); }}>
                    Add
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!showRecycleBin && <StatsDashboard subjects={subjects} />}

        {/* Action Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
          <div className="relative w-full sm:w-96">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder={`Search ${showRecycleBin ? 'Deleted' : 'Active'}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex space-x-3 items-center">
             {currentUser?.role === 'Admin' && (
                <button onClick={() => setShowRecycleBin(!showRecycleBin)} className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${showRecycleBin ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-300'}`}>
                   <Trash2 size={16} className="mr-2"/>
                   {showRecycleBin ? 'Back to Active Data' : 'Recycle Bin'}
                </button>
             )}

             {!showRecycleBin && (
               <>
               </>
             )}
          </div>
        </div>

        {/* Loading / Empty States */}
        {isLoading && (
            <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
        )}

        {!isLoading && showRecycleBin && (
           <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
              <div className="flex">
                <div className="flex-shrink-0"><Trash2 className="h-5 w-5 text-red-400" aria-hidden="true" /></div>
                <div className="ml-3"><p className="text-sm text-red-700">You are viewing the <b>Recycle Bin</b>.</p></div>
              </div>
            </div>
        )}

        {/* Data Table */}
        {!isLoading && (
            <div className="bg-white shadow overflow-hidden border-b border-gray-200 sm:rounded-lg">
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{role === 'Admin' ? 'Identity & Contact' : 'De-Identified Code'}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cohort / Dx</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Demographics</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Version</th>
                    <th className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {filteredSubjects.length === 0 ? (
                    <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                        <FileText className="mx-auto h-12 w-12 text-gray-300" />
                        <p className="mt-2 text-sm font-medium">No records found {showRecycleBin ? 'in trash' : ''}</p>
                        </td>
                    </tr>
                    ) : (
                    filteredSubjects.map((subject) => (
                        <tr key={subject.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                            {role === 'Admin' ? (
                            <>
                                <div className="text-sm font-bold text-gray-900">{subject.real_name || 'Unknown Name'}</div>
                                <div className="text-xs text-gray-500">{subject.contact_info || 'No contact info'}</div>
                                <div className="text-xs text-indigo-600 mt-1">ID: {subject.subject_id}</div>
                            </>
                            ) : (
                            <>
                                <div className="text-sm font-bold text-indigo-600 flex items-center"><Shield size={12} className="mr-1"/> {subject.name_code || 'Pending'}</div>
                                <div className="text-xs text-gray-400">ID: {subject.subject_id}</div>
                            </>
                            )}
                        </td>
                        <td className="px-6 py-4">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">{subject.cohort_group}</span>
                            <div className="text-sm text-gray-900 mt-1">{subject.diagnosis || 'Healthy'}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{subject.sex}</div>
                            <div className="text-xs text-gray-500">DOB: {subject.dob || 'N/A'}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                            {subject.exclusion_flag ? (
                            <span className="inline-flex items-center text-xs font-medium text-red-600"><AlertCircle className="w-3 h-3 mr-1"/> Excluded</span>
                            ) : subject.consent_status ? (
                            <span className="text-xs text-green-600">Consented</span>
                            ) : (
                            <span className="text-xs text-gray-400">No Consent</span>
                            )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col">
                                <span className="text-xs font-mono text-gray-600 bg-gray-100 px-2 py-0.5 rounded w-fit">v{subject.version}</span>
                                <span className="text-[10px] text-gray-400 mt-1">{subject.updatedAt ? new Date(subject.updatedAt).toLocaleDateString() : 'N/A'}</span>
                            </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            {showRecycleBin ? (
                                <div className="flex justify-end space-x-3">
                                    <button onClick={() => handleRestore(subject.id)} className="text-green-600 hover:text-green-900 flex items-center" title="Restore"><RefreshCcw size={18} /></button>
                                    <button onClick={() => handleHardDelete(subject.id)} className="text-red-600 hover:text-red-900 flex items-center" title="Permanently Delete"><Trash2 size={18} /></button>
                                </div>
                            ) : (
                                <div className="flex justify-end space-x-3">
                                    <button onClick={() => startEdit(subject)} className="text-indigo-600 hover:text-indigo-900">{role === 'Visitor' ? <Eye size={18} /> : <Edit size={18} />}</button>
                                    {role === 'Admin' && <button onClick={() => handleSoftDelete(subject.id)} className="text-orange-500 hover:text-orange-700" title="Move to Recycle Bin"><Trash2 size={18} /></button>}
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
                <div className="text-sm text-gray-700">Showing <span className="font-medium">{filteredSubjects.length}</span> records</div>
                </div>
            )}
            </div>
        )}
      </main>

      {/* Modal Forms */}
      {isFormOpen && <SubjectForm initialData={editingSubject} onSubmit={editingSubject ? handleEditSubject : handleAddSubject} onCancel={() => { setIsFormOpen(false); setEditingSubject(null); }} userRole={role}/>}
      {isLoginOpen && <LoginModal onLogin={handleLogin} onCancel={() => setIsLoginOpen(false)}/>}
      {isUserMgmtOpen && <UserManagementModal onClose={() => setIsUserMgmtOpen(false)} />}
    </div>
  );
};
export default App;
