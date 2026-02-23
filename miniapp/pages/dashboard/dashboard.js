const { request, getSession, clearSession } = require('../../utils/request');

function detectMimeTypeFromBytes(bytes) {
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
}

Page({
  data: {
    user: null,
    activeTab: 'subjects',
    loading: false,
    showRecycleBin: false,
    subjects: [],
    protocols: [],
    users: [],
    stats: {
      totalSubjects: 0,
      consentedCount: 0,
      excludedCount: 0,
      completeRecords: 0,
      completenessRate: '0.0'
    },

    creatingUser: false,
    newUsername: '',
    newFullName: '',
    newEmail: '',
    newRole: 'Researcher',
    newPassword: '',

    backupExporting: false,
    backupImporting: false,
    lastBackupFileName: '',

    editingSubjectId: '',
    editingSubjectBase: null,
    currentSubjectImageNames: [],
    removeSubjectImage: false,
    subjectConflict: {
      subject_id: false,
      cohort_group: false,
      enrollment_date: false,
      diagnosis: false,
      notes: false
    },
    subject_id: '',
    cohort_group: 'Control',
    enrollment_date: '2026-02-22',
    diagnosis: '',
    notes: '',
    subjectImageNames: [],
    subjectImageDataUrls: [],
    subjectImageMimeTypes: [],

    editingProtocolId: '',
    editingProtocolBase: null,
    protocolConflict: {
      projectName: false,
      projectId: false,
      executionTime: false,
      protocolNotes: false,
      protocolFile: false
    },
    currentProtocolFileName: '',
    projectName: '',
    projectId: '',
    executionTime: '',
    protocolNotes: '',
    protocolFileName: '',
    protocolFileDataUrl: '',
    protocolFileMimeType: ''
  },

  onLoad() {
    const session = getSession();
    if (!session?.sessionToken) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.setData({ user: session });
    this.refreshAll();
  },

  onPullDownRefresh() {
    this.refreshAll().finally(() => wx.stopPullDownRefresh());
  },

  canEditSubjects() {
    return this.data.user?.role !== 'Visitor';
  },

  canManageProtocols() {
    return this.data.user?.role === 'Admin';
  },

  canManageUsers() {
    return this.data.user?.role === 'Admin' && this.data.user?.adminTier === 1;
  },

  async handleApiError(error, fallback = 'Request failed') {
    const message = error?.message || fallback;
    if (error?.statusCode === 409) {
      const conflictFields = Array.isArray(error?.body?.conflictFields) ? error.body.conflictFields : [];
      const conflictText = conflictFields.length > 0
        ? `\n\nConflict fields:\n- ${conflictFields.join('\n- ')}`
        : '';
      await new Promise((resolve) => {
        wx.showModal({
          title: 'Version Conflict',
          content: `${message}${conflictText}\n\nReload latest data now?`,
          confirmText: 'Reload',
          cancelText: 'Close',
          success: (res) => {
            if (res.confirm) {
              this.refreshAll();
            }
            resolve();
          },
          fail: () => resolve()
        });
      });
      return;
    }

    wx.showToast({ title: message, icon: 'none' });
  },

  async refreshAll() {
    this.setData({ loading: true });
    try {
      const deletedFlag = this.data.showRecycleBin ? 'true' : 'false';
      const requests = [
        request({ url: `/subjects?deleted=${deletedFlag}` }),
        request({ url: `/study-protocols?deleted=${deletedFlag}` })
      ];
      if (this.canManageUsers()) {
        requests.push(request({ url: '/users' }));
      }

      const results = await Promise.all(requests);
      const subjects = results[0] || [];
      const protocols = results[1] || [];
      const users = this.canManageUsers() ? (results[2] || []) : [];
      this.setData({ subjects, protocols, users });
      this.recomputeStats(subjects);
    } catch (error) {
      await this.handleApiError(error, 'Load failed');
    } finally {
      this.setData({ loading: false });
    }
  },

  recomputeStats(subjects) {
    const list = Array.isArray(subjects) ? subjects : [];
    const totalSubjects = list.length;
    const consentedCount = list.filter((item) => !!item.consent_status).length;
    const excludedCount = list.filter((item) => !!item.exclusion_flag).length;
    const requiredFields = ['height_cm', 'mass_kg', 'bmi', 'sex', 'cohort_group'];
    const completeRecords = list.filter((subject) => requiredFields.every((key) => {
      const value = subject?.[key];
      if (value === null || value === undefined) return false;
      if (typeof value === 'string') return value.trim().length > 0;
      return true;
    })).length;
    const completenessRate = totalSubjects > 0 ? ((completeRecords / totalSubjects) * 100).toFixed(1) : '0.0';

    this.setData({
      stats: {
        totalSubjects,
        consentedCount,
        excludedCount,
        completeRecords,
        completenessRate
      }
    });
  },

  switchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab });
  },

  async toggleRecycleBin() {
    this.setData({ showRecycleBin: !this.data.showRecycleBin });
    await this.refreshAll();
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    const updates = {
      [field]: e.detail.value
    };

    const subjectFields = ['subject_id', 'cohort_group', 'enrollment_date', 'diagnosis', 'notes'];
    if (subjectFields.includes(field)) {
      updates[`subjectConflict.${field}`] = false;
    }

    const protocolFieldMap = {
      projectName: 'projectName',
      projectId: 'projectId',
      executionTime: 'executionTime',
      protocolNotes: 'protocolNotes'
    };
    const protocolConflictField = protocolFieldMap[field];
    if (protocolConflictField) {
      updates[`protocolConflict.${protocolConflictField}`] = false;
    }

    this.setData(updates);
  },

  onRoleChange(e) {
    const index = Number(e?.detail?.value || 0);
    this.setData({ newRole: index === 1 ? 'Admin' : 'Researcher' });
  },

  startCreateSubject() {
    if (!this.canEditSubjects()) return;
    this.setData({
      editingSubjectId: '',
      editingSubjectBase: null,
      currentSubjectImageNames: [],
      subjectConflict: {
        subject_id: false,
        cohort_group: false,
        enrollment_date: false,
        diagnosis: false,
        notes: false
      },
      subject_id: '',
      cohort_group: 'Control',
      enrollment_date: '2026-02-22',
      diagnosis: '',
      notes: '',
      subjectImageNames: [],
      subjectImageDataUrls: [],
      subjectImageMimeTypes: [],
      removeSubjectImage: false
    });
  },

  startEditSubject(e) {
    if (!this.canEditSubjects()) return;
    const id = e.currentTarget.dataset.id;
    const subject = this.data.subjects.find((item) => item.id === id);
    if (!subject) return;

    this.setData({
      editingSubjectId: subject.id,
      editingSubjectBase: subject,
      currentSubjectImageNames: (subject.staticImages || (subject.staticImage ? [subject.staticImage] : [])).map((image) => image.fileName),
      subjectConflict: {
        subject_id: false,
        cohort_group: false,
        enrollment_date: false,
        diagnosis: false,
        notes: false
      },
      subject_id: subject.subject_id || '',
      cohort_group: subject.cohort_group || 'Control',
      enrollment_date: subject.enrollment_date || '2026-02-22',
      diagnosis: subject.diagnosis || '',
      notes: subject.notes || '',
      subjectImageNames: [],
      subjectImageDataUrls: [],
      subjectImageMimeTypes: [],
      removeSubjectImage: false
    });
  },

  async chooseSubjectImage() {
    try {
      const picked = await new Promise((resolve, reject) => {
        wx.chooseMessageFile({ count: 9, type: 'file', success: resolve, fail: reject });
      });

      const files = picked?.tempFiles || [];
      if (!files.length) return;

      const nextNames = [];
      const nextMimes = [];
      const nextDataUrls = [];

      for (const file of files) {
        const arrayBuffer = await new Promise((resolve, reject) => {
          wx.getFileSystemManager().readFile({
            filePath: file.path,
            success: (res) => resolve(res.data),
            fail: reject
          });
        });
        const mimeType = detectMimeTypeFromBytes(new Uint8Array(arrayBuffer));
        if (mimeType !== 'image/jpeg' && mimeType !== 'image/png') {
          wx.showToast({ title: 'Allowed: JPEG, PNG', icon: 'none' });
          return;
        }

        const base64 = await new Promise((resolve, reject) => {
          wx.getFileSystemManager().readFile({
            filePath: file.path,
            encoding: 'base64',
            success: (res) => resolve(res.data),
            fail: reject
          });
        });

        nextNames.push(file.name);
        nextMimes.push(mimeType);
        nextDataUrls.push(`data:${mimeType};base64,${base64}`);
      }

      this.setData({
        subjectImageNames: nextNames,
        subjectImageMimeTypes: nextMimes,
        subjectImageDataUrls: nextDataUrls,
        removeSubjectImage: false
      });
    } catch {
      wx.showToast({ title: 'Image selection failed', icon: 'none' });
    }
  },

  removeCurrentSubjectImage() {
    this.setData({
      currentSubjectImageNames: [],
      subjectImageNames: [],
      subjectImageDataUrls: [],
      subjectImageMimeTypes: [],
      removeSubjectImage: true
    });
  },

  async saveSubject() {
    if (!this.canEditSubjects()) {
      wx.showToast({ title: 'Visitor is read-only', icon: 'none' });
      return;
    }

    const payload = {
      subject_id: (this.data.subject_id || '').trim(),
      cohort_group: (this.data.cohort_group || 'Control').trim(),
      enrollment_date: (this.data.enrollment_date || '2026-02-22').trim(),
      diagnosis: (this.data.diagnosis || '').trim(),
      notes: (this.data.notes || '').trim(),
      staticImages: this.data.subjectImageDataUrls.length > 0
        ? this.data.subjectImageDataUrls.map((dataUrl, index) => ({
            fileName: this.data.subjectImageNames[index],
            mimeType: this.data.subjectImageMimeTypes[index],
            dataUrl
          }))
        : (this.data.removeSubjectImage ? null : undefined)
    };

    if (!payload.subject_id || !payload.cohort_group) {
      wx.showToast({ title: 'Subject ID and Cohort required', icon: 'none' });
      return;
    }

    try {
      if (this.data.editingSubjectId) {
        const base = this.data.editingSubjectBase;
        await request({
          url: `/subjects/${this.data.editingSubjectId}`,
          method: 'PUT',
          data: {
            updates: {
              ...payload,
              staticImages: payload.staticImages !== undefined
                ? payload.staticImages
                : (base.staticImages || (base.staticImage ? [base.staticImage] : [])),
              version: base.version
            },
            baseState: base
          }
        });
      } else {
        await request({
          url: '/subjects',
          method: 'POST',
          data: {
            data: {
              ...payload,
              name_code: `WX-${Date.now().toString().slice(-4)}`,
              sex: 'Male',
              dob: '1999-01-01',
              handedness: 'Right',
              leg_dominance: 'Right',
              height_cm: 170,
              mass_kg: 70,
              bmi: 24.2,
              affected_side: 'None',
              consent_status: false,
              exclusion_flag: false
            }
          }
        });
      }

      wx.showToast({ title: this.data.editingSubjectId ? 'Updated' : 'Created', icon: 'success' });
      this.startCreateSubject();
      await this.refreshAll();
    } catch (error) {
      if (error?.statusCode === 409) {
        this.applySubjectConflict(error?.body?.conflictFields);
      }
      await this.handleApiError(error, 'Save subject failed');
    }
  },

  async openSubjectImage(e) {
    const id = e.currentTarget.dataset.id;
    const subject = this.data.subjects.find((item) => item.id === id);
    const images = subject?.staticImages || (subject?.staticImage ? [subject.staticImage] : []);
    if (!images.length) {
      wx.showToast({ title: 'No image', icon: 'none' });
      return;
    }

    try {
      const urls = [];
      for (const image of images) {
        const [meta, base64] = image.dataUrl.split(',');
        const mime = (meta.match(/data:(.*?);base64/) || [])[1] || image.mimeType;
        const ext = mime === 'image/png' ? 'png' : 'jpg';
        const filePath = `${wx.env.USER_DATA_PATH}/subject_${Date.now()}_${urls.length}.${ext}`;
        wx.getFileSystemManager().writeFileSync(filePath, base64, 'base64');
        urls.push(filePath);
      }
      wx.previewImage({ urls, current: urls[0] });
    } catch {
      wx.showToast({ title: 'Open image failed', icon: 'none' });
    }
  },

  async openEditingSubjectImage() {
    const subject = this.data.editingSubjectBase;
    const images = subject?.staticImages || (subject?.staticImage ? [subject.staticImage] : []);
    if (!images.length) {
      wx.showToast({ title: 'No current image', icon: 'none' });
      return;
    }
    try {
      await this.openSubjectImage({ currentTarget: { dataset: { id: subject.id } } });
    } catch {
      wx.showToast({ title: 'Open image failed', icon: 'none' });
    }
  },

  async deleteOrRestoreSubject(e) {
    if (!this.canEditSubjects()) return;
    const id = e.currentTarget.dataset.id;
    const subject = this.data.subjects.find((item) => item.id === id);
    if (!subject) return;

    try {
      if (this.data.showRecycleBin) {
        await request({
          url: `/subjects/${id}/restore`,
          method: 'POST',
          data: { expectedVersion: subject.version }
        });
      } else {
        await request({
          url: `/subjects/${id}/soft-delete`,
          method: 'POST',
          data: { expectedVersion: subject.version }
        });
      }
      wx.showToast({ title: this.data.showRecycleBin ? 'Restored' : 'Deleted', icon: 'success' });
      await this.refreshAll();
    } catch (error) {
      await this.handleApiError(error, this.data.showRecycleBin ? 'Restore failed' : 'Delete failed');
    }
  },

  startCreateProtocol() {
    if (!this.canManageProtocols()) return;
    this.setData({
      editingProtocolId: '',
      editingProtocolBase: null,
      protocolConflict: {
        projectName: false,
        projectId: false,
        executionTime: false,
        protocolNotes: false,
        protocolFile: false
      },
      currentProtocolFileName: '',
      projectName: '',
      projectId: '',
      executionTime: '',
      protocolNotes: '',
      protocolFileName: '',
      protocolFileDataUrl: '',
      protocolFileMimeType: ''
    });
  },

  startEditProtocol(e) {
    if (!this.canManageProtocols()) return;
    const id = e.currentTarget.dataset.id;
    const protocol = this.data.protocols.find((item) => item.id === id);
    if (!protocol) return;

    this.setData({
      editingProtocolId: protocol.id,
      editingProtocolBase: protocol,
      protocolConflict: {
        projectName: false,
        projectId: false,
        executionTime: false,
        protocolNotes: false,
        protocolFile: false
      },
      currentProtocolFileName: protocol.ethicalApproval?.fileName || '',
      projectName: protocol.projectName || '',
      projectId: protocol.projectId || '',
      executionTime: protocol.executionTime || '',
      protocolNotes: protocol.notes || '',
      protocolFileName: '',
      protocolFileDataUrl: '',
      protocolFileMimeType: ''
    });
  },

  async chooseProtocolFile() {
    try {
      const picked = await new Promise((resolve, reject) => {
        wx.chooseMessageFile({ count: 1, type: 'file', success: resolve, fail: reject });
      });

      const file = picked?.tempFiles?.[0];
      if (!file) return;

      const arrayBuffer = await new Promise((resolve, reject) => {
        wx.getFileSystemManager().readFile({
          filePath: file.path,
          success: (res) => resolve(res.data),
          fail: reject
        });
      });
      const mimeType = detectMimeTypeFromBytes(new Uint8Array(arrayBuffer));
      if (!mimeType) {
        wx.showToast({ title: 'Allowed: PDF, JPEG, PNG', icon: 'none' });
        return;
      }

      const base64 = await new Promise((resolve, reject) => {
        wx.getFileSystemManager().readFile({
          filePath: file.path,
          encoding: 'base64',
          success: (res) => resolve(res.data),
          fail: reject
        });
      });

      this.setData({
        protocolFileName: file.name,
        protocolFileMimeType: mimeType,
        protocolFileDataUrl: `data:${mimeType};base64,${base64}`,
        'protocolConflict.protocolFile': false
      });
    } catch {
      wx.showToast({ title: 'File selection failed', icon: 'none' });
    }
  },

  async saveProtocol() {
    if (!this.canManageProtocols()) {
      wx.showToast({ title: 'Admin only', icon: 'none' });
      return;
    }

    const projectName = (this.data.projectName || '').trim();
    const projectId = (this.data.projectId || '').trim();
    const executionTime = (this.data.executionTime || '').trim();
    const notes = (this.data.protocolNotes || '').trim();

    if (!projectName || !projectId || !executionTime) {
      wx.showToast({ title: 'Missing required fields', icon: 'none' });
      return;
    }

    try {
      const selectedEthical = this.data.protocolFileDataUrl
        ? {
            fileName: this.data.protocolFileName,
            mimeType: this.data.protocolFileMimeType,
            dataUrl: this.data.protocolFileDataUrl
          }
        : undefined;

      if (this.data.editingProtocolId) {
        const base = this.data.editingProtocolBase;
        await request({
          url: `/study-protocols/${this.data.editingProtocolId}`,
          method: 'PUT',
          data: {
            updates: {
              projectName,
              projectId,
              executionTime,
              notes,
              ethicalApproval: selectedEthical || base.ethicalApproval,
              version: base.version
            },
            baseState: base
          }
        });
      } else {
        await request({
          url: '/study-protocols',
          method: 'POST',
          data: {
            data: {
              projectName,
              projectId,
              executionTime,
              notes,
              ethicalApproval: selectedEthical
            }
          }
        });
      }

      wx.showToast({ title: this.data.editingProtocolId ? 'Updated' : 'Created', icon: 'success' });
      this.startCreateProtocol();
      await this.refreshAll();
    } catch (error) {
      if (error?.statusCode === 409) {
        this.applyProtocolConflict(error?.body?.conflictFields);
      }
      await this.handleApiError(error, 'Save protocol failed');
    }
  },

  applySubjectConflict(conflictFields) {
    const fields = Array.isArray(conflictFields) ? conflictFields : [];
    const next = {
      subject_id: false,
      cohort_group: false,
      enrollment_date: false,
      diagnosis: false,
      notes: false
    };

    fields.forEach((field) => {
      const fieldText = String(field || '');
      const normalized = fieldText.includes('.') ? fieldText.split('.').pop() : fieldText;
      if (Object.prototype.hasOwnProperty.call(next, normalized)) {
        next[normalized] = true;
      }
    });

    this.setData({ subjectConflict: next });
  },

  applyProtocolConflict(conflictFields) {
    const fields = Array.isArray(conflictFields) ? conflictFields : [];
    const next = {
      projectName: false,
      projectId: false,
      executionTime: false,
      protocolNotes: false,
      protocolFile: false
    };

    const map = {
      projectName: 'projectName',
      projectId: 'projectId',
      executionTime: 'executionTime',
      notes: 'protocolNotes',
      protocolNotes: 'protocolNotes',
      ethicalApproval: 'protocolFile'
    };

    fields.forEach((field) => {
      const fieldText = String(field || '');
      const normalized = fieldText.includes('.') ? fieldText.split('.').pop() : fieldText;
      const mapped = map[normalized] || (fieldText.includes('ethicalApproval') ? 'protocolFile' : '');
      if (mapped && Object.prototype.hasOwnProperty.call(next, mapped)) {
        next[mapped] = true;
      }
    });

    this.setData({ protocolConflict: next });
  },

  async deleteOrRestoreProtocol(e) {
    if (!this.canManageProtocols()) return;
    const id = e.currentTarget.dataset.id;
    const protocol = this.data.protocols.find((item) => item.id === id);
    if (!protocol) return;

    try {
      if (this.data.showRecycleBin) {
        await request({
          url: `/study-protocols/${id}/restore`,
          method: 'POST',
          data: { expectedVersion: protocol.version }
        });
      } else {
        await request({
          url: `/study-protocols/${id}/soft-delete`,
          method: 'POST',
          data: { expectedVersion: protocol.version }
        });
      }
      wx.showToast({ title: this.data.showRecycleBin ? 'Restored' : 'Deleted', icon: 'success' });
      await this.refreshAll();
    } catch (error) {
      await this.handleApiError(error, this.data.showRecycleBin ? 'Restore failed' : 'Delete failed');
    }
  },

  startCreateUser() {
    if (!this.canManageUsers()) return;
    this.setData({
      creatingUser: true,
      newUsername: '',
      newFullName: '',
      newEmail: '',
      newRole: 'Researcher',
      newPassword: ''
    });
  },

  cancelCreateUser() {
    this.setData({
      creatingUser: false,
      newUsername: '',
      newFullName: '',
      newEmail: '',
      newRole: 'Researcher',
      newPassword: ''
    });
  },

  async createUser() {
    if (!this.canManageUsers()) {
      wx.showToast({ title: 'Primary Admin only', icon: 'none' });
      return;
    }

    const username = (this.data.newUsername || '').trim();
    const fullName = (this.data.newFullName || '').trim();
    const email = (this.data.newEmail || '').trim();
    const role = this.data.newRole || 'Researcher';
    const password = (this.data.newPassword || '').trim();

    if (!username || !fullName || !email || !password) {
      wx.showToast({ title: 'All fields required', icon: 'none' });
      return;
    }
    if (password.length < 8) {
      wx.showToast({ title: 'Password min 8 chars', icon: 'none' });
      return;
    }

    try {
      await request({
        url: '/users',
        method: 'POST',
        data: {
          username,
          fullName,
          email,
          role,
          isActive: role === 'Admin' ? false : true,
          password
        }
      });
      wx.showToast({ title: 'User created', icon: 'success' });
      this.cancelCreateUser();
      await this.refreshAll();
    } catch (error) {
      await this.handleApiError(error, 'Create user failed');
    }
  },

  async toggleUserStatus(e) {
    if (!this.canManageUsers()) return;
    const id = e.currentTarget.dataset.id;
    const user = this.data.users.find((item) => item.id === id);
    if (!user) return;

    try {
      await request({
        url: `/users/${id}`,
        method: 'PUT',
        data: { isActive: !user.isActive }
      });
      wx.showToast({ title: user.isActive ? 'Deactivated' : 'Approved', icon: 'success' });
      await this.refreshAll();
    } catch (error) {
      await this.handleApiError(error, 'Update user failed');
    }
  },

  async resetUserPassword(e) {
    if (!this.canManageUsers()) return;
    const id = e.currentTarget.dataset.id;
    const user = this.data.users.find((item) => item.id === id);
    if (!user) return;

    const generated = `${Math.random().toString(36).slice(-8)}${Math.random().toString(36).slice(-4)}`;
    try {
      await request({
        url: `/users/${id}/reset-password`,
        method: 'POST',
        data: { password: generated }
      });

      await new Promise((resolve) => {
        wx.showModal({
          title: 'Temporary Password',
          content: `Username: ${user.username}\nPassword: ${generated}`,
          confirmText: 'Copy',
          cancelText: 'Close',
          success: (res) => {
            if (res.confirm) {
              wx.setClipboardData({ data: `${user.username} / ${generated}` });
            }
            resolve();
          },
          fail: () => resolve()
        });
      });
    } catch (error) {
      await this.handleApiError(error, 'Reset password failed');
    }
  },

  async deleteUser(e) {
    if (!this.canManageUsers()) return;
    const id = e.currentTarget.dataset.id;

    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: 'Delete User',
        content: 'Permanently delete this user?',
        confirmColor: '#ef4444',
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false)
      });
    });
    if (!confirmed) return;

    try {
      await request({
        url: `/users/${id}`,
        method: 'DELETE'
      });
      wx.showToast({ title: 'Deleted', icon: 'success' });
      await this.refreshAll();
    } catch (error) {
      await this.handleApiError(error, 'Delete user failed');
    }
  },

  async exportBackup() {
    if (!this.canManageUsers()) {
      wx.showToast({ title: 'Primary Admin only', icon: 'none' });
      return;
    }

    this.setData({ backupExporting: true });
    try {
      const payload = await request({ url: '/backup/export' });
      const fileName = `biomech_FULL_BACKUP_${new Date().toISOString().slice(0, 10)}.json`;
      const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`;
      wx.getFileSystemManager().writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
      this.setData({ lastBackupFileName: fileName });
      wx.showToast({ title: 'Backup exported', icon: 'success' });
    } catch (error) {
      await this.handleApiError(error, 'Backup export failed');
    } finally {
      this.setData({ backupExporting: false });
    }
  },

  async importBackup() {
    if (!this.canManageUsers()) {
      wx.showToast({ title: 'Primary Admin only', icon: 'none' });
      return;
    }

    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: 'Restore DB',
        content: 'This will overwrite current data. Continue?',
        confirmColor: '#ef4444',
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false)
      });
    });
    if (!confirmed) return;

    try {
      const picked = await new Promise((resolve, reject) => {
        wx.chooseMessageFile({ count: 1, type: 'file', success: resolve, fail: reject });
      });
      const file = picked?.tempFiles?.[0];
      if (!file?.path) {
        wx.showToast({ title: 'No file selected', icon: 'none' });
        return;
      }

      this.setData({ backupImporting: true });
      const content = await new Promise((resolve, reject) => {
        wx.getFileSystemManager().readFile({
          filePath: file.path,
          encoding: 'utf8',
          success: (res) => resolve(res.data),
          fail: reject
        });
      });

      const parsed = JSON.parse(content);
      await request({
        url: '/backup/import',
        method: 'POST',
        data: parsed
      });

      wx.showToast({ title: 'Restore success', icon: 'success' });
      await this.refreshAll();
    } catch (error) {
      await this.handleApiError(error, 'Backup restore failed');
    } finally {
      this.setData({ backupImporting: false });
    }
  },

  async openEthical(e) {
    const id = e.currentTarget.dataset.id;
    const protocol = this.data.protocols.find((item) => item.id === id);
    const ethical = protocol?.ethicalApproval;
    if (!ethical?.dataUrl) {
      wx.showToast({ title: 'No file', icon: 'none' });
      return;
    }

    try {
      const [meta, base64] = ethical.dataUrl.split(',');
      const mime = (meta.match(/data:(.*?);base64/) || [])[1] || ethical.mimeType;
      const ext = mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : 'jpg';
      const filePath = `${wx.env.USER_DATA_PATH}/ethical_${Date.now()}.${ext}`;
      wx.getFileSystemManager().writeFileSync(filePath, base64, 'base64');

      if (mime === 'application/pdf') {
        wx.openDocument({ filePath, showMenu: true });
      } else {
        wx.previewImage({ urls: [filePath], current: filePath });
      }
    } catch {
      wx.showToast({ title: 'Open file failed', icon: 'none' });
    }
  },

  async openEditingEthical() {
    const protocol = this.data.editingProtocolBase;
    if (!protocol?.ethicalApproval?.dataUrl) {
      wx.showToast({ title: 'No current file', icon: 'none' });
      return;
    }
    try {
      await this.openEthical({ currentTarget: { dataset: { id: protocol.id } } });
    } catch {
      wx.showToast({ title: 'Open file failed', icon: 'none' });
    }
  },

  async logout() {
    try {
      await request({ url: '/auth/logout', method: 'POST' });
    } catch {
    }
    clearSession();
    wx.reLaunch({ url: '/pages/login/login' });
  }
});
