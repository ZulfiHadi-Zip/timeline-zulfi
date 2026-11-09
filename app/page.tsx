'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  requestNotificationPermission,
  registerServiceWorker,
  setupScheduleReminders,
} from '@/lib/notificationService';
import { 
  Calendar, Clock, MapPin, Bell, RefreshCw, Plus, 
  Trash2, Edit, Shuffle, UserPlus, CalendarDays, Database,
  X, User, Tag, Calendar as CalendarIcon, Settings, Menu, Layers
} from 'lucide-react';

export default function DashboardZulfi() {
  const [activeTab, setActiveTab] = useState('timeline');
  const [selectedDayFilter, setSelectedDayFilter] = useState(0); // 0: Semua Hari, 1-7: Senin-Minggu
  const [schedules, setSchedules] = useState([]);
  const [regularList, setRegularList] = useState([]);
  const [specialList, setSpecialList] = useState([]);
  const [overrideList, setOverrideList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notifGranted, setNotifGranted] = useState(false);

  // State untuk Floating Pop-up Speed Dial Menu
  const [isFabOpen, setIsFabOpen] = useState(false);

  // Edit Control States
  const [editingRegId, setEditingRegId] = useState(null);
  const [editingSpecId, setEditingSpecId] = useState(null);
  const [editingOverId, setEditingOverId] = useState(null);

  // Modal States
  const [showRegularModal, setShowRegularModal] = useState(false);
  const [showSpecialModal, setShowSpecialModal] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [showManageSpecialModal, setShowManageSpecialModal] = useState(false);

  // Form States
  const [regForm, setRegForm] = useState({ student_name: '', day_of_week: 1, start_time: '16:00', end_time: '17:30', mode: 'Onsite', location: 'GS' });
  const [specForm, setSpecForm] = useState({ student_name: '', category: 'Trial', specific_date: '', start_time: '16:00', end_time: '17:30', mode: 'Onsite', location: 'GS', notes: '' });
  const [overForm, setOverForm] = useState({ regular_schedule_id: '', target_date: '', new_start_time: '16:00', new_end_time: '17:30' });

  const daysName = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

  const timeSlots = [
    '07:00', '07:30', '08:00', '08:30', '09:00', '09:30', 
    '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', 
    '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', 
    '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', 
    '19:00', '19:30', '20:00'
  ];

  const calculateEndTime = (startTimeStr) => {
    if (!startTimeStr) return '17:30';
    const [hours, minutes] = startTimeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes + 90, 0);
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  useEffect(() => {
    registerServiceWorker();
    requestNotificationPermission().then((granted) => setNotifGranted(granted));
  }, []);

  useEffect(() => {
    fetchAllData();

    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'regular_schedules' }, () => fetchAllData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'special_schedules' }, () => fetchAllData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_overrides' }, () => fetchAllData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // PERBAIKAN LOGIKA RINGKASAN HARI INI (TERMASUK RIVANO & SEJENISNYA)
  const fetchAllData = async () => {
    setLoading(true);
    const todayIndex = new Date().getDay() || 7; 
    const todayDateStr = new Date().toISOString().split('T')[0];

    const { data: regData } = await supabase.from('regular_schedules').select('*').order('day_of_week').order('start_time');
    setRegularList(regData || []);

    const { data: specialData } = await supabase.from('special_schedules').select('*');
    setSpecialList(specialData || []);

    const { data: overrideData } = await supabase.from('schedule_overrides').select('*');
    setOverrideList(overrideData || []);

    // 1. Jadwal Tetap Hari Ini yang Tidak Dibatalkan/Dipindah
    const todayRegular = (regData || []).filter(r => r.day_of_week === todayIndex);
    const cancelledIds = (overrideData || []).filter((o) => o.original_date === todayDateStr).map((o) => o.regular_schedule_id);
    const activeTodayRegular = todayRegular.filter((r) => !cancelledIds.includes(r.id));

    // 2. Jadwal Khusus / Trial / Pergantian Murid / Pribadi Hari Ini
    const todaySpecial = (specialData || []).filter(s => {
      if (s.specific_date) {
        return s.specific_date === todayDateStr;
      }
      return false;
    });

    // 3. Pindahan Jadwal yang Masuk Hari Ini
    const movedIn = (overrideData || [])
      .filter((o) => o.target_date === todayDateStr)
      .map((o) => {
        const parent = (regData || []).find(r => r.id === o.regular_schedule_id);
        return {
          id: o.id,
          student_name: parent ? parent.student_name : 'Pindahan Murid',
          start_time: o.new_start_time,
          end_time: o.new_end_time,
          mode: 'Pindahan',
          location: parent?.location || 'GS'
        };
      });

    const combined = [...activeTodayRegular, ...todaySpecial, ...movedIn].sort((a, b) =>
      a.start_time.localeCompare(b.start_time)
    );

    setSchedules(combined);
    setLoading(false);
    setupScheduleReminders(combined);
  };

  // Handlers Start Time
  const handleRegStartChange = (val) => {
    setRegForm({ ...regForm, start_time: val, end_time: calculateEndTime(val) });
  };

  const handleSpecStartChange = (val) => {
    if (specForm.category === 'Personal') {
      setSpecForm({ ...specForm, start_time: val });
    } else {
      setSpecForm({ ...specForm, start_time: val, end_time: calculateEndTime(val) });
    }
  };

  const handleOverStartChange = (val) => {
    setOverForm({ ...overForm, new_start_time: val, new_end_time: calculateEndTime(val) });
  };

  // CRUD JADWAL TETAP
  const handleSaveRegular = async (e) => {
    e.preventDefault();
    if (editingRegId) {
      await supabase.from('regular_schedules').update(regForm).eq('id', editingRegId);
    } else {
      await supabase.from('regular_schedules').insert([regForm]);
    }

    closeRegularModal();
    fetchAllData();
  };

  const handleEditRegular = (item) => {
    setEditingRegId(item.id);
    setRegForm({
      student_name: item.student_name,
      day_of_week: item.day_of_week,
      start_time: item.start_time.slice(0, 5),
      end_time: item.end_time.slice(0, 5),
      mode: item.mode || 'Onsite',
      location: item.location || 'GS'
    });
    setShowRegularModal(true);
  };

  const handleDeleteRegular = async (id) => {
    if (confirm('Yakin ingin menghapus jadwal tetap ini?')) {
      await supabase.from('regular_schedules').delete().eq('id', id);
      fetchAllData();
    }
  };

  const closeRegularModal = () => {
    setShowRegularModal(false);
    setEditingRegId(null);
    setRegForm({ student_name: '', day_of_week: 1, start_time: '16:00', end_time: '17:30', mode: 'Onsite', location: 'GS' });
  };

  // CRUD JADWAL KHUSUS / KEGIATAN PRIBADI
  const handleSaveSpecial = async (e) => {
    e.preventDefault();
    if (editingSpecId) {
      await supabase.from('special_schedules').update(specForm).eq('id', editingSpecId);
    } else {
      await supabase.from('special_schedules').insert([specForm]);
    }
    closeSpecialModal();
    fetchAllData();
  };

  const handleEditSpecial = (item) => {
    setEditingSpecId(item.id);
    setSpecForm({
      student_name: item.student_name,
      category: item.category,
      specific_date: item.specific_date,
      start_time: item.start_time.slice(0, 5),
      end_time: item.end_time.slice(0, 5),
      mode: item.mode || 'Onsite',
      location: item.location || 'GS',
      notes: item.notes || ''
    });
    setShowSpecialModal(true);
  };

  const handleDeleteSpecial = async (id) => {
    if (confirm('Hapus entri ini?')) {
      await supabase.from('special_schedules').delete().eq('id', id);
      fetchAllData();
    }
  };

  const closeSpecialModal = () => {
    setShowSpecialModal(false);
    setEditingSpecId(null);
    setSpecForm({ student_name: '', category: 'Trial', specific_date: '', start_time: '16:00', end_time: '17:30', mode: 'Onsite', location: 'GS', notes: '' });
  };

  // CRUD PINDAH JADWAL SEMENTARA
  const handleSaveOverride = async (e) => {
    e.preventDefault();
    const parent = regularList.find(r => r.id === overForm.regular_schedule_id);
    if (!parent) return;

    const targetDateObj = new Date(overForm.target_date);
    const targetDayIndex = targetDateObj.getDay() || 7;
    const diffDays = parent.day_of_week - targetDayIndex;
    
    const origDateObj = new Date(targetDateObj);
    origDateObj.setDate(targetDateObj.getDate() + diffDays);
    const calculatedOriginalDate = origDateObj.toISOString().split('T')[0];

    const payload = {
      regular_schedule_id: overForm.regular_schedule_id,
      original_date: calculatedOriginalDate,
      target_date: overForm.target_date,
      new_start_time: overForm.new_start_time,
      new_end_time: overForm.new_end_time
    };

    if (editingOverId) {
      await supabase.from('schedule_overrides').update(payload).eq('id', editingOverId);
    } else {
      await supabase.from('schedule_overrides').insert([payload]);
    }

    closeOverrideModal();
    fetchAllData();
  };

  const handleEditOverride = (item) => {
    setEditingOverId(item.id);
    setOverForm({
      regular_schedule_id: item.regular_schedule_id,
      target_date: item.target_date,
      new_start_time: item.new_start_time.slice(0, 5),
      new_end_time: item.new_end_time.slice(0, 5)
    });
    setShowOverrideModal(true);
  };

  const handleDeleteOverride = async (id) => {
    if (confirm('Batalkan perpindahan jadwal ini?')) {
      await supabase.from('schedule_overrides').delete().eq('id', id);
      fetchAllData();
    }
  };

  const closeOverrideModal = () => {
    setShowOverrideModal(false);
    setEditingOverId(null);
    setOverForm({ regular_schedule_id: '', target_date: '', new_start_time: '16:00', new_end_time: '17:30' });
  };

  // HELPER MATRIX SPAN CELL
  const getDayRowCells = (dayNum) => {
    const todayDateStr = new Date().toISOString().split('T')[0];
    const activeEvents = [];

    // Add Overrides
    overrideList.forEach(o => {
      const tDate = new Date(o.target_date);
      const dIndex = tDate.getDay() || 7;
      if (dIndex === dayNum) {
        const parent = regularList.find(r => r.id === o.regular_schedule_id);
        activeEvents.push({
          name: parent?.student_name || 'Murid',
          start: o.new_start_time.slice(0, 5),
          end: o.new_end_time.slice(0, 5),
          type: 'Moved',
          isExpired: o.target_date < todayDateStr
        });
      }
    });

    // Add Special Schedules
    specialList.forEach(s => {
      const sDate = new Date(s.specific_date);
      const dIndex = sDate.getDay() || 7;
      if (dIndex === dayNum) {
        activeEvents.push({
          name: s.student_name,
          start: s.start_time.slice(0, 5),
          end: s.end_time.slice(0, 5),
          type: s.category,
          isExpired: s.specific_date < todayDateStr
        });
      }
    });

    // Add Regular Schedules
    regularList.forEach(r => {
      if (r.day_of_week === dayNum) {
        const isCancelled = overrideList.some(o => o.regular_schedule_id === r.id);
        if (!isCancelled) {
          activeEvents.push({
            name: r.student_name,
            start: r.start_time.slice(0, 5),
            end: r.end_time.slice(0, 5),
            type: r.mode,
            isExpired: false
          });
        }
      }
    });

    const cells = [];
    let i = 0;

    while (i < timeSlots.length) {
      const currentSlot = timeSlots[i];
      const matchingEvents = activeEvents.filter(e => e.start === currentSlot);

      if (matchingEvents.length > 0) {
        const studentNames = matchingEvents.map(e => e.name).join(', ');
        const primaryType = matchingEvents[0].type;
        const isExpired = matchingEvents.some(e => e.isExpired);
        const endTime = matchingEvents[0].end;

        const startIdx = timeSlots.indexOf(currentSlot);
        const endIdx = timeSlots.indexOf(endTime);
        
        let calculatedSpan = 4;
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          calculatedSpan = (endIdx - startIdx) + 1;
        }

        cells.push({
          type: 'event',
          student_name: studentNames,
          eventType: primaryType,
          isExpired: isExpired,
          span: calculatedSpan,
          timeText: `${currentSlot} - ${endTime}`
        });

        i += (calculatedSpan - 1);
      } else {
        cells.push({ type: 'empty', span: 1 });
      }
      i++;
    }

    return cells;
  };

  const filteredMasterList = selectedDayFilter === 0 
    ? regularList 
    : regularList.filter(r => r.day_of_week === selectedDayFilter);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 p-4 md:p-8 font-sans pb-36">
      {/* Header Utama */}
      <header className="max-w-7xl mx-auto mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-200/80 gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Aplikasi Timeline Harian Zulfi</h1>
          <p className="text-sm font-medium text-slate-500 mt-1 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-600" />
            {new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchAllData} className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl transition" title="Refresh Data">
            <RefreshCw className="w-4 h-4" />
          </button>
          {!notifGranted && (
            <button onClick={() => requestNotificationPermission().then(setNotifGranted)} className="flex items-center gap-2 bg-indigo-50 text-indigo-700 px-4 py-2.5 rounded-2xl text-xs font-bold hover:bg-indigo-100 transition border border-indigo-200">
              <Bell className="w-4 h-4" /> Notifikasi
            </button>
          )}
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto mb-6 flex flex-wrap gap-2 bg-white p-2 rounded-2xl border border-slate-200/80 shadow-sm">
        <button onClick={() => setActiveTab('timeline')} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition ${activeTab === 'timeline' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'text-slate-600 hover:bg-slate-100'}`}>
          <CalendarDays className="w-4 h-4" /> Timeline Utama & Harian
        </button>
        <button onClick={() => setActiveTab('master')} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition ${activeTab === 'master' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'text-slate-600 hover:bg-slate-100'}`}>
          <Database className="w-4 h-4" /> Data Jadwal Tetap
        </button>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto space-y-6">
        {/* TAB 1: TIMELINE UTAMA */}
        {activeTab === 'timeline' && (
          <>
            {/* OVERVIEW HARI INI */}
            <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white p-6 rounded-3xl shadow-lg relative overflow-hidden">
              <div className="flex justify-between items-center mb-4 border-b border-indigo-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse"></span>
                  <h2 className="text-base font-bold tracking-wide">Ringkasan Jadwal Mengajar Hari Ini</h2>
                </div>
                <span className="bg-indigo-500/30 text-indigo-200 text-xs font-bold px-3 py-1 rounded-full border border-indigo-400/30">
                  {schedules.length} Sesi Terjadwal
                </span>
              </div>

              {loading ? (
                <div className="text-center py-6 text-indigo-200 text-xs">Memuat jadwal...</div>
              ) : schedules.length === 0 ? (
                <p className="text-xs text-slate-300 py-2">Tidak ada jadwal mengajar hari ini. Selamat beristirahat! ☕</p>
              ) : (
                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {schedules.map((item, idx) => (
                    <div key={idx} className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10 flex items-center justify-between">
                      <div>
                        <p className="font-extrabold text-sm text-white">{item.student_name}</p>
                        <p className="text-[11px] text-indigo-200 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3 text-indigo-400" /> {item.start_time.slice(0, 5)} - {item.end_time.slice(0, 5)}
                        </p>
                      </div>
                      <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-white/15 text-white border border-white/20">
                        {item.location || item.mode || 'Regular'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* MATRIX TIMELINE MINGGUAN */}
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
              <div className="p-5 bg-slate-50/80 border-b border-slate-200 flex justify-between items-center flex-wrap gap-4">
                <div>
                  <h2 className="font-extrabold text-slate-800 text-base">Timeline Matriks Mingguan</h2>
                  <p className="text-xs font-medium text-slate-500">Timeline mingguan terupdate otomatis setiap minggu.</p>
                </div>
                <div className="flex items-center gap-3 text-xs font-bold flex-wrap">
                  <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-full bg-amber-300 border border-amber-400"></span> Onsite</span>
                  <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-full bg-emerald-400 border border-emerald-500"></span> Online</span>
                  <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-full bg-purple-400 border border-purple-500"></span> Substitute</span>
                  <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-full bg-rose-400 border border-rose-500"></span> Trial / Pindahan</span>
                  <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-full bg-slate-900 border border-black"></span> Kegiatan Pribadi (Libur/Kuliah)</span>
                </div>
              </div>

              <div className="overflow-x-auto p-4">
                <table className="w-full text-center text-xs border-separate border-spacing-1.5 min-w-[1200px]">
                  <thead>
                    <tr className="bg-cyan-600 text-white font-black">
                      <th className="p-3.5 rounded-2xl w-28 sticky left-0 bg-cyan-700 z-10 shadow-sm">Hari / Jam</th>
                      {timeSlots.map((ts) => (
                        <th key={ts} className={`p-2 rounded-xl min-w-[70px] ${ts === '12:00' || ts === '18:00' ? 'bg-cyan-800' : ''}`}>
                          {ts}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4, 5, 6, 7].map((dayNum) => {
                      const rowCells = getDayRowCells(dayNum);
                      return (
                        <tr key={dayNum}>
                          <td className="p-3.5 font-bold bg-cyan-100 text-cyan-950 rounded-2xl sticky left-0 z-10 shadow-sm">
                            {daysName[dayNum]}
                          </td>
                          {rowCells.map((cell, idx) => {
                            if (cell.type === 'event') {
                              let colorClass = 'bg-amber-300 text-amber-950 border-amber-400';
                              if (cell.eventType === 'Online') colorClass = 'bg-emerald-400 text-emerald-950 border-emerald-500';
                              if (cell.eventType === 'Substitute') colorClass = 'bg-purple-400 text-white border-purple-500';
                              if (cell.eventType === 'Personal') colorClass = 'bg-slate-900 text-white border-black font-black shadow-md'; 
                              
                              if (cell.eventType === 'Moved' || cell.eventType === 'Trial') {
                                if (cell.isExpired) {
                                  colorClass = 'bg-slate-100 text-slate-400 border-dashed border-slate-300 opacity-50';
                                } else {
                                  colorClass = 'bg-rose-400 text-white border-rose-500 font-extrabold';
                                }
                              }

                              return (
                                <td
                                  key={idx}
                                  colSpan={cell.span}
                                  className={`p-3 rounded-2xl border font-bold text-xs shadow-sm transition-all duration-200 ${colorClass}`}
                                  title={`${cell.student_name} (${cell.timeText})`}
                                >
                                  <div className="flex items-center justify-center">
                                    <span className="truncate font-extrabold text-sm">{cell.student_name}</span>
                                  </div>
                                </td>
                              );
                            }

                            return (
                              <td key={idx} className="p-2 rounded-xl bg-slate-50/50 text-slate-300 font-normal text-[10px]">
                                •
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* TAB 2: DATABASE JADWAL TETAP */}
        {activeTab === 'master' && (
          <div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Database Master Jadwal Tetap</h2>
                <p className="text-xs text-slate-500">Kelola dan filter seluruh murid tetap berdasarkan hari mengajar</p>
              </div>

              <button 
                onClick={() => {
                  setEditingRegId(null);
                  setRegForm({ student_name: '', day_of_week: 1, start_time: '16:00', end_time: '17:30', mode: 'Onsite', location: 'GS' });
                  setShowRegularModal(true);
                }} 
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-2xl transition shadow-md shadow-indigo-200 shrink-0"
              >
                <Plus className="w-4 h-4" /> Tambah Jadwal Tetap
              </button>
            </div>

            {/* SUB-MENU FILTER HARI */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-4">
              <button
                onClick={() => setSelectedDayFilter(0)}
                className={`px-4 py-2 rounded-2xl text-xs font-bold transition shrink-0 ${
                  selectedDayFilter === 0 
                    ? 'bg-slate-900 text-white shadow-sm' 
                    : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200/80'
                }`}
              >
                Semua Hari
              </button>
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <button
                  key={d}
                  onClick={() => setSelectedDayFilter(d)}
                  className={`px-4 py-2 rounded-2xl text-xs font-bold transition shrink-0 ${
                    selectedDayFilter === d 
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' 
                      : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200/80'
                  }`}
                >
                  {daysName[d]}
                </button>
              ))}
            </div>

            {/* TABEL DATABASE */}
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
              {filteredMasterList.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs font-medium">
                  Tidak ada jadwal tetap untuk hari {daysName[selectedDayFilter] || 'ini'}.
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold">
                    <tr>
                      <th className="p-4">Nama Anak</th>
                      <th className="p-4">Hari</th>
                      <th className="p-4">Jam Mengajar</th>
                      <th className="p-4">Lokasi / Mode</th>
                      <th className="p-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredMasterList.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/60 transition">
                        <td className="p-4 font-bold text-slate-900">{item.student_name}</td>
                        <td className="p-4 font-medium text-slate-700">
                          <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-bold">
                            {daysName[item.day_of_week]}
                          </span>
                        </td>
                        <td className="p-4 font-semibold text-indigo-700">{item.start_time.slice(0, 5)} - {item.end_time.slice(0, 5)}</td>
                        <td className="p-4 font-medium text-slate-600">{item.location} ({item.mode})</td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => handleEditRegular(item)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition" title="Edit Data">
                              <Edit className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDeleteRegular(item.id)} className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition" title="Hapus Data">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </main>

      {/* FLOATING ACTION SPEED DIAL MENU (POP-UP BULAT MODERN) */}
      <div className="fixed bottom-6 right-6 flex flex-col items-end gap-3 z-30">
        {isFabOpen && (
          <div className="flex flex-col items-end gap-2.5 animate-in fade-in slide-in-from-bottom-4 duration-200">
            <button 
              onClick={() => { setEditingSpecId(null); setShowSpecialModal(true); setIsFabOpen(false); }} 
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-extrabold px-4 py-3 rounded-2xl shadow-xl shadow-amber-500/20 transition transform hover:-translate-y-0.5"
            >
              <UserPlus className="w-4 h-4" /> + Trial / Pengganti / Pribadi (Hitam)
            </button>
            <button 
              onClick={() => { setEditingOverId(null); setShowOverrideModal(true); setIsFabOpen(false); }} 
              className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold px-4 py-3 rounded-2xl shadow-xl shadow-rose-600/20 transition transform hover:-translate-y-0.5"
            >
              <Shuffle className="w-4 h-4" /> Pindah Jadwal Sementara
            </button>
            <button 
              onClick={() => { setShowManageSpecialModal(true); setIsFabOpen(false); }} 
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-extrabold px-4 py-2.5 rounded-2xl shadow-xl transition transform hover:-translate-y-0.5 border border-slate-700"
            >
              <Settings className="w-3.5 h-3.5 text-amber-400" /> Kelola & Edit Data
            </button>
          </div>
        )}

        <button 
          onClick={() => setIsFabOpen(!isFabOpen)}
          className={`w-14 h-14 rounded-full text-white shadow-2xl flex items-center justify-center transition-all duration-300 transform hover:scale-105 ${
            isFabOpen ? 'bg-slate-900 rotate-45 shadow-slate-900/40' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/40'
          }`}
          title="Menu Aksi Cepat"
        >
          <Plus className="w-7 h-7 stroke-[2.5]" />
        </button>
      </div>

      {/* MODAL 1: TAMBAH / EDIT JADWAL TETAP */}
      {showRegularModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Database className="w-5 h-5 text-indigo-600" /> {editingRegId ? 'Edit Master Jadwal Tetap' : 'Tambah Master Jadwal Tetap'}
              </h3>
              <button onClick={closeRegularModal} className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRegular} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-indigo-600" /> Nama Anak / Murid
                </label>
                <input 
                  required 
                  type="text" 
                  placeholder="Contoh: Sophia" 
                  className="w-full border border-slate-300 rounded-2xl p-3 text-sm font-semibold text-slate-900 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 shadow-sm" 
                  value={regForm.student_name} 
                  onChange={e => setRegForm({...regForm, student_name: e.target.value})} 
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 block">Hari</label>
                  <select 
                    className="w-full border border-slate-300 rounded-2xl p-3 text-sm font-semibold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600 shadow-sm" 
                    value={regForm.day_of_week} 
                    onChange={e => setRegForm({...regForm, day_of_week: parseInt(e.target.value)})}
                  >
                    {[1,2,3,4,5,6,7].map(d => <option key={d} value={d}>{daysName[d]}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 block">Mode Belajar</label>
                  <select 
                    className="w-full border border-slate-300 rounded-2xl p-3 text-sm font-semibold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600 shadow-sm" 
                    value={regForm.mode} 
                    onChange={e => setRegForm({...regForm, mode: e.target.value})}
                  >
                    <option value="Onsite">Onsite (Kuning)</option>
                    <option value="Online">Online (Hijau)</option>
                    <option value="School">School (Biru)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-indigo-600" /> Lokasi / Cabang
                </label>
                <input 
                  type="text" 
                  placeholder="GS / BSD / Pondok Cabe" 
                  className="w-full border border-slate-300 rounded-2xl p-3 text-sm font-semibold text-slate-900 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 shadow-sm" 
                  value={regForm.location} 
                  onChange={e => setRegForm({...regForm, location: e.target.value})} 
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-indigo-600" /> Jam Mulai
                  </label>
                  <input 
                    type="time" 
                    className="w-full border border-slate-300 rounded-2xl p-3 text-sm font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600 shadow-sm" 
                    value={regForm.start_time} 
                    onChange={e => handleRegStartChange(e.target.value)} 
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-indigo-600" /> Jam Selesai (+90m)
                  </label>
                  <input 
                    readOnly
                    type="time" 
                    className="w-full border border-slate-200 rounded-2xl p-3 text-sm font-bold text-slate-500 bg-slate-100 cursor-not-allowed" 
                    value={regForm.end_time} 
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 mt-6 pt-3 border-t border-slate-100">
                <button type="button" onClick={closeRegularModal} className="px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-2xl transition">Batal</button>
                <button 
                  type="submit" 
                  className="px-5 py-2.5 text-xs font-bold text-white rounded-2xl transition shadow-md bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200"
                >
                  {editingRegId ? 'Update Data' : 'Simpan Data'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: TAMBAH / EDIT JADWAL KHUSUS & KEGIATAN PRIBADI (JAM SELESAI EDISINYA BISA EDITED UNTUK PRIBADI) */}
      {showSpecialModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-amber-500" /> {editingSpecId ? 'Edit Entri' : 'Tambah Jadwal Khusus / Pribadi'}
              </h3>
              <button onClick={closeSpecialModal} className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSpecial} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-amber-500" /> Nama / Keterangan
                </label>
                <input 
                  required 
                  type="text" 
                  placeholder="Contoh: Libur, Kuliah, Ibadah, atau Nama Anak Trial" 
                  className="w-full border border-slate-300 rounded-2xl p-3 text-sm font-semibold text-slate-900 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm" 
                  value={specForm.student_name} 
                  onChange={e => setSpecForm({...specForm, student_name: e.target.value})} 
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-amber-500" /> Kategori / Mode
                  </label>
                  <select 
                    className="w-full border border-slate-300 rounded-2xl p-3 text-sm font-semibold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm" 
                    value={specForm.category} 
                    onChange={e => setSpecForm({...specForm, category: e.target.value})}
                  >
                    <option value="Trial">Anak Trial (Pink)</option>
                    <option value="Substitute">Pengganti Guru (Ungu)</option>
                    <option value="Personal">Kegiatan Pribadi / Libur (Hitam)</option>
                    <option value="Other">Lain-lain</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <CalendarIcon className="w-3.5 h-3.5 text-amber-500" /> Tanggal
                  </label>
                  <input 
                    required 
                    type="date" 
                    className="w-full border border-slate-300 rounded-2xl p-3 text-sm font-semibold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm" 
                    value={specForm.specific_date} 
                    onChange={e => setSpecForm({...specForm, specific_date: e.target.value})} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-500" /> Jam Mulai
                  </label>
                  <input 
                    type="time" 
                    className="w-full border border-slate-300 rounded-2xl p-3 text-sm font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm" 
                    value={specForm.start_time} 
                    onChange={e => handleSpecStartChange(e.target.value)} 
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-500" /> Jam Selesai {specForm.category === 'Personal' ? '(Bebas)' : '(+90m)'}
                  </label>
                  <input 
                    readOnly={specForm.category !== 'Personal'}
                    type="time" 
                    className={`w-full border rounded-2xl p-3 text-sm font-bold shadow-sm ${
                      specForm.category === 'Personal' 
                        ? 'border-slate-300 text-slate-900 bg-white focus:ring-2 focus:ring-amber-500' 
                        : 'border-slate-200 text-slate-500 bg-slate-100 cursor-not-allowed'
                    }`}
                    value={specForm.end_time} 
                    onChange={e => setSpecForm({...specForm, end_time: e.target.value})}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 mt-6 pt-3 border-t border-slate-100">
                <button type="button" onClick={closeSpecialModal} className="px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-2xl transition">Batal</button>
                <button type="submit" className="px-5 py-2.5 text-xs font-bold bg-amber-500 text-white rounded-2xl hover:bg-amber-600 transition shadow-md shadow-amber-200">
                  {editingSpecId ? 'Update Jadwal' : 'Tambah Jadwal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: TAMBAH / EDIT PINDAH JADWAL */}
      {showOverrideModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Shuffle className="w-5 h-5 text-rose-600" /> {editingOverId ? 'Edit Pindah Jadwal' : 'Pindahkan Jadwal Sementara'}
              </h3>
              <button onClick={closeOverrideModal} className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveOverride} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-rose-600" /> Pilih Murid
                </label>
                <select 
                  required 
                  className="w-full border border-slate-300 rounded-2xl p-3 text-sm font-semibold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-rose-600 shadow-sm" 
                  value={overForm.regular_schedule_id} 
                  onChange={e => setOverForm({...overForm, regular_schedule_id: e.target.value})}
                >
                  <option value="">-- Pilih Murid Jadwal Tetap --</option>
                  {regularList.map(r => (
                    <option key={r.id} value={r.id}>{r.student_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <CalendarIcon className="w-3.5 h-3.5 text-rose-600" /> Tanggal Pindah
                </label>
                <input 
                  required 
                  type="date" 
                  className="w-full border border-slate-300 rounded-2xl p-3 text-sm font-semibold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-rose-600 shadow-sm" 
                  value={overForm.target_date} 
                  onChange={e => setOverForm({...overForm, target_date: e.target.value})} 
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-rose-600" /> Jam Mulai Baru
                  </label>
                  <input 
                    type="time" 
                    className="w-full border border-slate-300 rounded-2xl p-3 text-sm font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-rose-600 shadow-sm" 
                    value={overForm.new_start_time} 
                    onChange={e => handleOverStartChange(e.target.value)} 
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-rose-600" /> Jam Selesai (+90m)
                  </label>
                  <input 
                    readOnly
                    type="time" 
                    className="w-full border border-slate-200 rounded-2xl p-3 text-sm font-bold text-slate-500 bg-slate-100 cursor-not-allowed" 
                    value={overForm.new_end_time} 
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 mt-6 pt-3 border-t border-slate-100">
                <button type="button" onClick={closeOverrideModal} className="px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-2xl transition">Batal</button>
                <button type="submit" className="px-5 py-2.5 text-xs font-bold bg-rose-600 text-white rounded-2xl hover:bg-rose-700 transition shadow-md shadow-rose-200">
                  {editingOverId ? 'Update Pindahan' : 'Proses Pindah'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: KELOLA & EDIT DATA JADWAL KHUSUS DAN PINDAHAN */}
      {showManageSpecialModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-600" /> Kelola & Edit Jadwal Khusus/Pindahan
              </h3>
              <button onClick={() => setShowManageSpecialModal(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <h4 className="text-xs font-black text-amber-700 uppercase tracking-wider mb-2">Jadwal Khusus & Kegiatan Pribadi</h4>
                {specialList.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Belum ada jadwal khusus.</p>
                ) : (
                  <div className="space-y-2">
                    {specialList.map(s => (
                      <div key={s.id} className="p-3 bg-amber-50/50 rounded-2xl border border-amber-200/60 flex items-center justify-between text-xs">
                        <div>
                          <p className="font-bold text-slate-800">{s.student_name} <span className="font-semibold text-amber-700">({s.category})</span></p>
                          <p className="text-slate-500">{s.specific_date} | {s.start_time.slice(0,5)} - {s.end_time.slice(0,5)}</p>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => { setShowManageSpecialModal(false); handleEditSpecial(s); }} className="p-2 text-indigo-600 hover:bg-white rounded-xl transition border border-indigo-100" title="Edit">
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDeleteSpecial(s.id)} className="p-2 text-rose-600 hover:bg-white rounded-xl transition border border-rose-100" title="Hapus">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-xs font-black text-rose-700 uppercase tracking-wider mb-2">Jadwal Pindahan Sementara</h4>
                {overrideList.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Belum ada perpindahan jadwal.</p>
                ) : (
                  <div className="space-y-2">
                    {overrideList.map(o => {
                      const parent = regularList.find(r => r.id === o.regular_schedule_id);
                      return (
                        <div key={o.id} className="p-3 bg-rose-50/50 rounded-2xl border border-rose-200/60 flex items-center justify-between text-xs">
                          <div>
                            <p className="font-bold text-slate-800">{parent?.student_name || 'Murid'}</p>
                            <p className="text-slate-500">Pindah ke: {o.target_date} ({o.new_start_time.slice(0,5)} - {o.new_end_time.slice(0,5)})</p>
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => { setShowManageSpecialModal(false); handleEditOverride(o); }} className="p-2 text-indigo-600 hover:bg-white rounded-xl transition border border-indigo-100" title="Edit">
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDeleteOverride(o.id)} className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition border border-rose-100" title="Hapus">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}