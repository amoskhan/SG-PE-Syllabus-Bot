import React, { useState, useEffect } from 'react';
import { TeacherProfile, CustomSkillRubric, CustomRubricLevel } from '../../types';
import { ALL_FMS_SKILLS, getSkillChecklist } from '../../data/fundamentalMovementSkillsData';

interface RubricBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: TeacherProfile | null;
  onSave: (profile: TeacherProfile) => void;
}

interface DragItem {
  index: number;
  text: string;
}

const RubricBuilderModal: React.FC<RubricBuilderModalProps> = ({ isOpen, onClose, profile, onSave }) => {
  const [selectedSkill, setSelectedSkill] = useState<string>(ALL_FMS_SKILLS[0]);
  
  // State for the current skill being edited
  const [levels, setLevels] = useState<{
    beginning: CustomRubricLevel[];
    developing: CustomRubricLevel[];
    competent: CustomRubricLevel[];
    accomplished: CustomRubricLevel[];
  }>({ beginning: [], developing: [], competent: [], accomplished: [] });

  const [draggedItem, setDraggedItem] = useState<{ sourceLoc: string; index: number; text: string } | null>(null);

  // Load skill data
  useEffect(() => {
    if (!profile) return;
    
    const standardCriteria = getSkillChecklist(selectedSkill);
    const existingRubric = profile.customRubrics?.[selectedSkill];

    if (existingRubric) {
      // Restore from saved
      setLevels({
        beginning: existingRubric.beginning || [],
        developing: existingRubric.developing || [],
        competent: existingRubric.competent || [],
        accomplished: existingRubric.accomplished || [],
      });
    } else {
      // Fresh start
      setLevels({ beginning: [], developing: [], competent: [], accomplished: [] });
    }
  }, [selectedSkill, profile]);

  if (!isOpen || !profile) return null;

  const handleDragStart = (e: React.DragEvent, sourceLoc: string, index: number, text: string) => {
    setDraggedItem({ sourceLoc, index, text });
    e.dataTransfer.effectAllowed = 'move';
    // Needed for Firefox
    e.dataTransfer.setData('text/plain', sourceLoc + '-' + index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDropToGroup = (e: React.DragEvent, targetLevel: 'beginning' | 'developing' | 'competent' | 'accomplished', targetGroupId: string) => {
    e.preventDefault();
    if (!draggedItem) return;

    if (draggedItem.sourceLoc === `group-${targetGroupId}`) {
      setDraggedItem(null);
      return; // Dropped in the same place
    }

    // Update levels safely with deep clone
    setLevels(prevLevels => {
      const nextLevels = {
        beginning: prevLevels.beginning.map(g => ({ ...g, originalCriteriaIndices: [...g.originalCriteriaIndices] })),
        developing: prevLevels.developing.map(g => ({ ...g, originalCriteriaIndices: [...g.originalCriteriaIndices] })),
        competent: prevLevels.competent.map(g => ({ ...g, originalCriteriaIndices: [...g.originalCriteriaIndices] })),
        accomplished: prevLevels.accomplished.map(g => ({ ...g, originalCriteriaIndices: [...g.originalCriteriaIndices] }))
      };

      // 1. Remove from source group if it came from one
      if (draggedItem.sourceLoc.startsWith('group-')) {
        const sourceGroupId = draggedItem.sourceLoc.replace('group-', '');
        ['beginning', 'developing', 'competent', 'accomplished'].forEach(level => {
          const lKey = level as keyof typeof nextLevels;
          const groupIdx = nextLevels[lKey].findIndex(g => g.id === sourceGroupId);
          if (groupIdx > -1) {
            nextLevels[lKey][groupIdx].originalCriteriaIndices = nextLevels[lKey][groupIdx].originalCriteriaIndices.filter(i => i !== draggedItem.index);
          }
        });
      }

      // 2. Add to target group (ensure no duplicates)
      const targetGroupIndex = nextLevels[targetLevel].findIndex(g => g.id === targetGroupId);
      if (targetGroupIndex > -1) {
        if (!nextLevels[targetLevel][targetGroupIndex].originalCriteriaIndices.includes(draggedItem.index)) {
          nextLevels[targetLevel][targetGroupIndex].originalCriteriaIndices.push(draggedItem.index);
          nextLevels[targetLevel][targetGroupIndex].originalCriteriaIndices.sort((a, b) => a - b);
        }
      }

      return nextLevels;
    });

    setDraggedItem(null);
  };

  const handleDropToUnassigned = (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedItem) return;

    if (draggedItem.sourceLoc === 'unassigned') {
      setDraggedItem(null);
      return;
    }

    // 1. Remove from any source group
    if (draggedItem.sourceLoc.startsWith('group-')) {
      const sourceGroupId = draggedItem.sourceLoc.replace('group-', '');
      setLevels(prevLevels => {
        const nextLevels = {
          beginning: prevLevels.beginning.map(g => ({ ...g, originalCriteriaIndices: [...g.originalCriteriaIndices] })),
          developing: prevLevels.developing.map(g => ({ ...g, originalCriteriaIndices: [...g.originalCriteriaIndices] })),
          competent: prevLevels.competent.map(g => ({ ...g, originalCriteriaIndices: [...g.originalCriteriaIndices] })),
          accomplished: prevLevels.accomplished.map(g => ({ ...g, originalCriteriaIndices: [...g.originalCriteriaIndices] }))
        };

        ['beginning', 'developing', 'competent', 'accomplished'].forEach(level => {
          const lKey = level as keyof typeof nextLevels;
          const groupIdx = nextLevels[lKey].findIndex(g => g.id === sourceGroupId);
          if (groupIdx > -1) {
            nextLevels[lKey][groupIdx].originalCriteriaIndices = nextLevels[lKey][groupIdx].originalCriteriaIndices.filter(i => i !== draggedItem.index);
          }
        });
        return nextLevels;
      });
    }

    setDraggedItem(null);
  };

  const addGroup = (level: 'beginning' | 'developing' | 'competent' | 'accomplished') => {
    const labelName = prompt('Enter a label for this criteria group (e.g., "Pray", "Setup", "Follow Through"):');
    if (!labelName || !labelName.trim()) return;

    setLevels(prev => ({
      ...prev,
      [level]: [...prev[level], {
        id: Date.now().toString(),
        label: labelName.trim(),
        originalCriteriaIndices: []
      }]
    }));
  };

  const removeGroup = (level: 'beginning' | 'developing' | 'competent' | 'accomplished', groupId: string) => {
    if (!confirm('Are you sure you want to remove this group? Any assigned criteria will simply be removed from this level.')) return;
    
    // Remove group
    setLevels(prev => ({
      ...prev,
      [level]: prev[level].filter(g => g.id !== groupId)
    }));
  };

  const handleSave = () => {
    // Basic validation: warn if any unassigned
    const standardCriteria = getSkillChecklist(selectedSkill);
    const assignedIndices = new Set<number>();
    ['beginning', 'developing', 'competent', 'accomplished'].forEach(levelId => {
      const lvGroups = levels[levelId as keyof typeof levels] as CustomRubricLevel[];
      lvGroups?.forEach(g => {
        g.originalCriteriaIndices.forEach(idx => assignedIndices.add(idx));
      });
    });

    const unassignedCount = standardCriteria.length - assignedIndices.size;
    if (unassignedCount > 0) {
      if (!confirm(`You have ${unassignedCount} criteria left out. Do you still want to save? Any unused criteria will NOT be graded by the AI.`)) {
        return;
      }
    }

    const updatedRubrics = { ...profile.customRubrics };
    updatedRubrics[selectedSkill] = levels;

    const updatedProfile: TeacherProfile = {
      ...profile,
      customRubrics: updatedRubrics
    };

    onSave(updatedProfile);
    onClose();
  };

  const standardCriteria = getSkillChecklist(selectedSkill);

  const renderLevelColumn = (levelId: 'beginning' | 'developing' | 'competent' | 'accomplished', title: string) => (
    <div className="flex-1 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700 flex flex-col h-full overflow-hidden">
      <div className="flex justify-between items-center mb-3">
        <h4 className="font-bold text-slate-700 dark:text-slate-200">{title}</h4>
        <button 
          onClick={() => addGroup(levelId)}
          className="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400 p-1 px-3 rounded text-xs font-semibold hover:bg-indigo-200 dark:hover:bg-indigo-800 transition-colors"
        >
          + Add Label
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3">
        {levels[levelId].length === 0 && (
          <p className="text-sm text-slate-400 italic text-center py-4">No custom labels created. Click "+ Add Label" to group criteria.</p>
        )}
        
        {levels[levelId].map(group => (
          <div 
            key={group.id} 
            className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-2.5 bg-white dark:bg-slate-900 min-h-[80px] shrink-0 flex flex-col transition-all group/container"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDropToGroup(e, levelId, group.id)}
          >
            <div className="flex justify-between items-center mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">
              <span className="font-bold text-sm text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/40 rounded flex items-center gap-1.5 break-words">
                🏷️ {group.label}
              </span>
              <button onClick={() => removeGroup(levelId, group.id)} className="text-red-400 hover:text-red-600 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors rounded p-1 text-xs shrink-0 flex items-center justify-center">✕</button>
            </div>
            
            {group.originalCriteriaIndices.length === 0 ? (
              <div className="text-xs text-slate-400 italic text-center py-4 px-2 pointer-events-none flex-1 flex items-center justify-center border border-dashed border-transparent rounded bg-slate-50/50 dark:bg-slate-800/20">Drop criteria here</div>
            ) : (
              <div className="flex flex-col gap-2">
                {group.originalCriteriaIndices.map(idx => (
                  <div
                    key={idx}
                    draggable
                    onDragStart={(e) => handleDragStart(e, `group-${group.id}`, idx, standardCriteria[idx])}
                    className="bg-indigo-50 dark:bg-indigo-900/20 px-2.5 py-2 rounded-lg text-xs text-slate-700 dark:text-slate-300 cursor-move border border-indigo-100 dark:border-indigo-800/50 shadow-sm hover:shadow hover:border-indigo-300 break-words leading-snug flex items-start gap-1.5"
                  >
                    <span className="text-indigo-300 dark:text-indigo-700 shrink-0 select-none">⋮⋮</span>
                    <span className="mt-px">{standardCriteria[idx].replace(/^\d+\.\s*/, '')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-[90rem] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col h-[90vh] animate-scale-in">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white/80 dark:bg-slate-950/70">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
            <span className="text-2xl">⚙️</span>
            Custom School Rubrics
          </h2>
          <div className="flex items-center gap-4">
            <select
              value={selectedSkill}
              onChange={(e) => setSelectedSkill(e.target.value)}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              {ALL_FMS_SKILLS.map(skill => (
                <option key={skill} value={skill}>{skill}</option>
              ))}
            </select>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Builder Area */}
        <div className="flex-1 flex overflow-hidden p-4 gap-4 bg-slate-100/50 dark:bg-slate-950/50">
          
          {/* Unassigned Pool */}
          <div 
            className="w-1/4 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden"
            onDragOver={handleDragOver}
            onDrop={handleDropToUnassigned}
          >
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <h3 className="font-bold text-slate-700 dark:text-slate-200 flex items-center justify-between">
                <span>Standard Criteria</span>
                <span className="text-xs bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded-full">{standardCriteria.length}</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">Drag these standard MOE criteria into your progression levels. You can drag the same item multiple times!</p>
            </div>
            <div className="flex-1 p-3 overflow-y-auto flex flex-col gap-2 relative">
              
              {(() => {
                const assignedIndices = new Set<number>();
                ['beginning', 'developing', 'competent', 'accomplished'].forEach(levelId => {
                  const lvGroups = levels[levelId as keyof typeof levels] as CustomRubricLevel[];
                  lvGroups?.forEach(g => {
                    g.originalCriteriaIndices.forEach(idx => assignedIndices.add(idx));
                  });
                });

                return standardCriteria.map((text, index) => {
                  const isAssigned = assignedIndices.has(index);
                  return (
                    <div
                      key={index}
                      draggable
                      onDragStart={(e) => handleDragStart(e, 'unassigned', index, text)}
                      className={`bg-white dark:bg-slate-800 p-3.5 rounded-xl border ${isAssigned ? 'border-indigo-100 dark:border-slate-700 shadow-none' : 'border-slate-200 dark:border-slate-700 shadow-sm'} cursor-move hover:border-indigo-400 hover:shadow-md transition-all group shrink-0 flex items-start gap-2`}
                    >
                      <span className="text-slate-300 dark:text-slate-600 group-hover:text-indigo-400 shrink-0 mt-0.5 select-none text-xs">⋮⋮</span>
                      <p className={`text-sm font-medium ${isAssigned ? 'text-slate-500 dark:text-slate-400 opacity-90' : 'text-slate-700 dark:text-slate-200'} leading-snug flex-1 break-words`}>
                        {text.replace(/^\d+\.\s*/, '')}
                      </p>
                      {isAssigned && <div className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-indigo-50 dark:bg-indigo-900/40 text-indigo-500 dark:text-indigo-400 font-bold text-[10px]" title="Assigned to at least one label">✓</div>}
                    </div>
                  );
                });
              })()}
              
            </div>
          </div>

          {/* Grading Levels Matrix */}
          <div className="flex-1 flex gap-4 overflow-x-auto">
            {renderLevelColumn('beginning', 'Level: Beginning')}
            {renderLevelColumn('developing', 'Level: Developing')}
            {renderLevelColumn('competent', 'Level: Competent')}
            {renderLevelColumn('accomplished', 'Level: Accomplished')}
          </div>

        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-colors shadow-lg shadow-indigo-200/50 dark:shadow-none flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Save Customized Rubric
          </button>
        </div>

      </div>
    </div>
  );
};

export default RubricBuilderModal;
