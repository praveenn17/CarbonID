import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Leaf, LayoutDashboard, ShoppingBag, Fingerprint, LogOut, FileSpreadsheet } from 'lucide-react';
import { logoutAndClear } from '../../store/authStore';

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await logoutAndClear();
    navigate('/login');
  };

  const links = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Data Imports', path: '/imports', icon: FileSpreadsheet },
    { name: 'Marketplace', path: '/marketplace', icon: ShoppingBag },
    { name: 'Carbon Passport', path: '/passport', icon: Fingerprint },
  ];

  return (
    <div className="w-64 h-screen bg-slate-950 border-r border-slate-800 flex flex-col justify-between fixed top-0 left-0 p-4">
      <div>
        {/* Brand */}
        <Link to="/dashboard" className="flex items-center gap-3 mb-10 px-2 mt-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Leaf className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">CarbonID</span>
        </Link>

        {/* Navigation */}
        <nav className="space-y-2">
          {links.map((link) => {
            const Icon = link.icon;
            const isActive = location.pathname.includes(link.path);
            
            return (
              <Link
                key={link.name}
                to={link.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium ${
                  isActive 
                    ? 'bg-emerald-500/10 text-emerald-400' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Icon className="w-5 h-5" />
                {link.name}
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="space-y-2">
        <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-500/10">
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </div>
    </div>
  );
}
