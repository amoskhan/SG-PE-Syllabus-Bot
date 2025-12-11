import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="bg-white border-b border-slate-200 p-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center text-white font-bold shadow-sm">
          SG
        </div>
        <div>
          <h1 className="font-bold text-lg text-slate-800">PE Syllabus Bot</h1>
          <p className="text-xs text-slate-500">Singapore MOE Curriculum</p>
        </div>
      </div>
      <div className="hidden md:block">
        <span className="px-3 py-1 bg-red-50 text-red-600 text-xs font-medium rounded-full border border-red-100">
          Powered by AI
        </span>
      </div>
    </header>
  );
};

export default Header;