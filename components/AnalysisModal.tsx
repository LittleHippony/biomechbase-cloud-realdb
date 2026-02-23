import React, { useState, useMemo } from 'react';
import { Subject } from '../types';
import { X, BarChart2, Table as TableIcon, Activity } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  LineChart, Line
} from 'recharts';

interface AnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjects: Subject[];
}

export const AnalysisModal: React.FC<AnalysisModalProps> = ({ isOpen, onClose, subjects }) => {
  // Stats Configuration
  const [groupBy, setGroupBy] = useState<string>('cohort_group');
  const [metric, setMetric] = useState<string>('bmi');
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');

  // Fields available for analysis
  const numericFields = [
    { label: 'Height (cm)', key: 'height_cm' },
    { label: 'Mass (kg)', key: 'mass_kg' },
    { label: 'BMI', key: 'bmi' },
    { label: 'Shoe Size (EU)', key: 'shoe_size_eu' },
    { label: 'Trunk Length (cm)', key: 'trunk_length_cm' },
    // Bilateral Measures
    { label: 'Limb Length R (cm)', key: 'limb_length_r_cm' },
    { label: 'Limb Length L (cm)', key: 'limb_length_l_cm' },
    { label: 'Thigh Length R (cm)', key: 'thigh_length_r_cm' },
    { label: 'Thigh Length L (cm)', key: 'thigh_length_l_cm' },
    { label: 'Shank Length R (cm)', key: 'shank_length_r_cm' },
    { label: 'Shank Length L (cm)', key: 'shank_length_l_cm' },
    { label: 'Foot Length R (cm)', key: 'foot_length_r_cm' },
    { label: 'Foot Length L (cm)', key: 'foot_length_l_cm' },
    { label: 'Knee Width R (cm)', key: 'knee_width_r_cm' },
    { label: 'Knee Width L (cm)', key: 'knee_width_l_cm' },
    { label: 'Ankle Width R (cm)', key: 'ankle_width_r_cm' },
    { label: 'Ankle Width L (cm)', key: 'ankle_width_l_cm' },
  ];

  const categoricalFields = [
    { label: 'Cohort Group', key: 'cohort_group' },
    { label: 'Sex', key: 'sex' },
    { label: 'Diagnosis', key: 'diagnosis' },
    { label: 'Affected Side', key: 'affected_side' },
    { label: 'Handedness', key: 'handedness' },
    { label: 'Leg Dominance', key: 'leg_dominance' },
  ];

  // Statistics Calculation
  const statsData = useMemo(() => {
    const groups: Record<string, number[]> = {};
    
    subjects.forEach(s => {
      // Get Group Value
      const groupVal = String((s as any)[groupBy] || 'Undefined');
      // Get Metric Value
      const val = (s as any)[metric];
      
      if (typeof val === 'number' && !isNaN(val)) {
        if (!groups[groupVal]) groups[groupVal] = [];
        groups[groupVal].push(val);
      }
    });

    const results = Object.keys(groups).map(g => {
      const values = groups[g];
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = sum / values.length;
      return {
        name: g,
        count: values.length,
        sum: Number(sum.toFixed(2)),
        avg: Number(avg.toFixed(2)),
      };
    });

    // Sort by name for Line Chart consistency, or by count/avg? Default by name.
    return results.sort((a, b) => a.name.localeCompare(b.name));
  }, [subjects, groupBy, metric]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose}></div>
        <div className="fixed inset-y-0 right-0 pl-10 max-w-full flex">
          <div className="w-screen max-w-4xl transform transition ease-in-out duration-500 sm:duration-700 bg-white shadow-xl flex flex-col">
            
            {/* Header */}
            <div className="px-6 py-4 bg-indigo-700 text-white flex justify-between items-center shadow-md">
              <div className="flex items-center space-x-2">
                <Activity className="h-6 w-6" />
                <h2 className="text-xl font-semibold">Data Analytics Suite</h2>
              </div>
              <button onClick={onClose} className="text-indigo-200 hover:text-white transition-colors">
                <X size={24} />
              </button>
            </div>

            {/* Navigation */}
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
                <button
                  className="border-indigo-500 text-indigo-600 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center"
                >
                  <BarChart2 className="mr-2 h-4 w-4" /> Statistical Analysis
                </button>
              </nav>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
              
              {/* Tab 1: Stats */}
                <div className="space-y-6">
                  {/* Controls */}
                  <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 grid grid-cols-1 md:grid-cols-3 gap-4">
                     <div>
                       <label className="block text-xs font-medium text-gray-500 mb-1">Group By (X-Axis)</label>
                       <select 
                         value={groupBy} 
                         onChange={(e) => setGroupBy(e.target.value)}
                         className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                       >
                         {categoricalFields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                       </select>
                     </div>
                     <div>
                       <label className="block text-xs font-medium text-gray-500 mb-1">Metric (Y-Axis)</label>
                       <select 
                         value={metric} 
                         onChange={(e) => setMetric(e.target.value)}
                         className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                       >
                         {numericFields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                       </select>
                     </div>
                     <div>
                       <label className="block text-xs font-medium text-gray-500 mb-1">Chart Type</label>
                       <div className="flex rounded-md shadow-sm">
                          <button 
                            onClick={() => setChartType('bar')}
                            className={`flex-1 px-3 py-2 text-sm border rounded-l-md ${chartType === 'bar' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-gray-700 border-gray-300'}`}
                          >
                            Bar
                          </button>
                          <button 
                            onClick={() => setChartType('line')}
                            className={`flex-1 px-3 py-2 text-sm border rounded-r-md ${chartType === 'line' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-gray-700 border-gray-300'}`}
                          >
                            Line
                          </button>
                       </div>
                     </div>
                  </div>

                  {/* Chart */}
                  <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 h-80">
                    <h4 className="text-sm font-bold text-gray-700 mb-4 text-center">
                      Average {numericFields.find(f => f.key === metric)?.label} by {categoricalFields.find(f => f.key === groupBy)?.label}
                    </h4>
                    <ResponsiveContainer width="100%" height="100%">
                      {chartType === 'bar' ? (
                        <BarChart data={statsData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" fontSize={12} tickLine={false} />
                          <YAxis fontSize={12} tickLine={false} />
                          <RechartsTooltip 
                             contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                          />
                          <Bar dataKey="avg" name="Average" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      ) : (
                        <LineChart data={statsData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" fontSize={12} />
                          <YAxis fontSize={12} />
                          <RechartsTooltip />
                          <Line type="monotone" dataKey="avg" name="Average" stroke="#4f46e5" strokeWidth={3} dot={{ r: 6 }} activeDot={{ r: 8 }} />
                        </LineChart>
                      )}
                    </ResponsiveContainer>
                  </div>

                  {/* Summary Table */}
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center">
                      <TableIcon className="h-4 w-4 text-gray-500 mr-2" />
                      <h3 className="text-sm font-medium text-gray-900">Summary Statistics</h3>
                    </div>
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Group</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Count (N)</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Sum</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Average</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {statsData.map((row) => (
                          <tr key={row.name}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.name}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{row.count}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{row.sum}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-indigo-600 text-right">{row.avg}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};