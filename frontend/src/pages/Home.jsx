import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import { FolderUp, Users, ArrowRight } from 'lucide-react'

export default function Home() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const name = user?.name?.split(' ')[0] || 'User'

  return (
    <Layout>
      <div className="min-h-screen flex flex-col items-center justify-center p-8">
        <div className="text-center mb-12 fade-in">
          <h1 className="text-4xl font-extrabold text-white mb-3">
            Welcome, {name} 👋
          </h1>
          <p className="text-slate-400 text-lg">
            What would you like to do today?
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-3xl fade-in">
          {/* File Sharing */}
          <button
            onClick={() => navigate('/fileshare')}
            className="group relative p-8 bg-slate-900 border border-slate-800 rounded-2xl text-left
                       hover:border-brand-500/50 hover:bg-slate-900/80 transition-all duration-300
                       hover:shadow-[0_0_40px_rgba(66,133,244,0.1)]"
          >
            <div className="w-16 h-16 bg-brand-500/10 rounded-2xl flex items-center justify-center mb-6
                            group-hover:bg-brand-500/20 transition-colors">
              <FolderUp size={32} className="text-brand-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-3">File Sharing</h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              Connect two devices using OTP or QR code. Upload any file — it is
              stored on Cloudinary CDN and instantly available for download on
              the other device. Files are deleted when the session ends.
            </p>
            <div className="flex flex-wrap gap-2 mb-6">
              {['OTP Session','QR Code','Any File Type','Cloudinary CDN','Auto Delete'].map(t => (
                <span key={t} className="text-xs bg-brand-500/10 text-brand-400 border border-brand-500/20 px-2 py-1 rounded-full">
                  {t}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2 text-brand-400 font-semibold text-sm
                            group-hover:gap-3 transition-all">
              Start File Sharing <ArrowRight size={16} />
            </div>
          </button>

          {/* Collaboration */}
          <button
            onClick={() => navigate('/collaborate')}
            className="group relative p-8 bg-slate-900 border border-slate-800 rounded-2xl text-left
                       hover:border-green-500/50 hover:bg-slate-900/80 transition-all duration-300
                       hover:shadow-[0_0_40px_rgba(15,157,88,0.1)]"
          >
            <div className="w-16 h-16 bg-green-500/10 rounded-2xl flex items-center justify-center mb-6
                            group-hover:bg-green-500/20 transition-colors">
              <Users size={32} className="text-green-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-3">Collaboration</h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              Work on Documents, Spreadsheets and Presentations together in real
              time. Changes sync instantly via Socket.io. Live cursors, comments,
              version history and auto-save included.
            </p>
            <div className="flex flex-wrap gap-2 mb-6">
              {['📝 Documents','📊 Sheets','📑 Slides','Live Cursors','Version History'].map(t => (
                <span key={t} className="text-xs bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-1 rounded-full">
                  {t}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2 text-green-400 font-semibold text-sm
                            group-hover:gap-3 transition-all">
              Start Collaborating <ArrowRight size={16} />
            </div>
          </button>
        </div>
      </div>
    </Layout>
  )
}
