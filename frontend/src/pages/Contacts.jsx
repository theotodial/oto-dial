import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api';
import { useAuth } from '../context/AuthContext';

// Helper function to generate avatar initials
const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name[0]?.toUpperCase() || '?';
};

// Helper function to generate avatar color
const getAvatarColor = (name) => {
  if (!name) return 'bg-gray-400';
  const colors = [
    'bg-indigo-500',
    'bg-green-500',
    'bg-blue-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-yellow-500',
    'bg-red-500',
    'bg-orange-500',
  ];
  const index = name.charCodeAt(0) % colors.length;
  return colors[index];
};

const Avatar = ({ name, phoneNumber, size = 'w-10 h-10', className = '' }) => {
  const displayName = name || phoneNumber || 'Unknown';
  const initials = getInitials(displayName);
  const colorClass = getAvatarColor(displayName);
  
  return (
    <div className={`${size} ${colorClass} rounded-full flex items-center justify-center text-white font-medium text-sm flex-shrink-0 ${className}`}>
      {initials}
    </div>
  );
};

const EditIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

function Contacts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingContact, setEditingContact] = useState(null);
  const [editName, setEditName] = useState('');
  const [deleteContactId, setDeleteContactId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    fetchContacts();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchContacts = async () => {
    try {
      setLoading(true);
      const response = await API.get('/api/contacts');
      
      if (!isMountedRef.current) return;
      
      if (response.error) {
        console.error('Error fetching contacts:', response.error);
        setContacts([]);
      } else {
        setContacts(response.data?.contacts || response.data || []);
      }
    } catch (err) {
      console.error('Error fetching contacts:', err);
      if (isMountedRef.current) {
        setContacts([]);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const handleEdit = (contact) => {
    setEditingContact(contact._id || contact.id);
    setEditName(contact.name || '');
  };

  const handleSaveEdit = async (contactId) => {
    try {
      const response = await API.put(`/api/contacts/${contactId}`, {
        name: editName
      });
      
      if (!isMountedRef.current) return;
      
      if (response.error) {
        alert(response.error);
      } else {
        await fetchContacts();
        setEditingContact(null);
        setEditName('');
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update contact');
    }
  };

  const handleDelete = async () => {
    if (!deleteContactId) return;
    
    try {
      setDeleting(true);
      const response = await API.delete(`/api/contacts/${deleteContactId}`);
      
      if (!isMountedRef.current) return;
      
      if (response.error) {
        alert(response.error);
      } else {
        await fetchContacts();
        setDeleteContactId(null);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete contact');
    } finally {
      if (isMountedRef.current) {
        setDeleting(false);
      }
    }
  };

  const filteredContacts = contacts.filter(contact => {
    const name = (contact.name || '').toLowerCase();
    const phone = (contact.phoneNumber || contact.phone_number || '').toLowerCase();
    const query = searchQuery.toLowerCase();
    return name.includes(query) || phone.includes(query);
  });

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-gray-300">Loading contacts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-gray-50 dark:bg-slate-900">
      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Contacts
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage your saved contacts
          </p>
        </div>

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Contacts List */}
        {filteredContacts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">
              {searchQuery ? 'No contacts found' : 'No contacts saved yet'}
            </p>
            <button
              onClick={() => navigate('/recents')}
              className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
            >
              Go to Voice to add contacts
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="divide-y divide-gray-200 dark:divide-slate-700">
              {filteredContacts.map((contact) => {
                const contactId = contact._id || contact.id;
                const isEditing = editingContact === contactId;
                const name = contact.name || contact.phoneNumber || contact.phone_number || 'Unknown';
                const phone = contact.phoneNumber || contact.phone_number || '';

                return (
                  <div key={contactId} className="p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <Avatar name={name} phoneNumber={phone} />
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="flex-1 px-3 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              autoFocus
                            />
                            <button
                              onClick={() => handleSaveEdit(contactId)}
                              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm transition-colors"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setEditingContact(null);
                                setEditName('');
                              }}
                              className="px-3 py-2 bg-gray-100 dark:bg-slate-600 hover:bg-gray-200 dark:hover:bg-slate-500 text-gray-700 dark:text-gray-200 rounded-lg text-sm transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="font-medium text-gray-900 dark:text-white">{name}</div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">{phone}</div>
                          </>
                        )}
                      </div>
                      {!isEditing && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEdit(contact)}
                            className="p-2 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                            title="Edit contact"
                          >
                            <EditIcon />
                          </button>
                          <button
                            onClick={() => setDeleteContactId(contactId)}
                            className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            title="Delete contact"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteContactId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !deleting && setDeleteContactId(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Delete Contact?</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              This contact will be permanently deleted. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteContactId(null)}
                disabled={deleting}
                className="flex-1 py-3 px-4 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 rounded-xl font-semibold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Contacts;
