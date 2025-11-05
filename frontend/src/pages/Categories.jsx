import { useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline';
import { fetchCategories, deleteCategory } from '../store/slices/categoriesSlice';
import CategoryModal from '../components/CategoryModal';

const Categories = () => {
  const dispatch = useDispatch();
  const { categories, loading } = useSelector((state) => state.categories);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState({});
  const [defaultParentId, setDefaultParentId] = useState(null);

  useEffect(() => {
    dispatch(fetchCategories());
  }, [dispatch]);

  // Build a full tree that supports deep nesting
  const categoryTreeRoots = useMemo(() => {
    const idToNode = new Map();
    const roots = [];

    // Initialize nodes
    for (const cat of categories) {
      idToNode.set(cat.id, { ...cat, children: [] });
    }

    // Connect children to parents
    for (const node of idToNode.values()) {
      if (node.parentCategoryId && idToNode.has(node.parentCategoryId)) {
        idToNode.get(node.parentCategoryId).children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }, [categories]);

  // Helper: does node or any descendant match the search?
  const nodeMatchesSearch = (node, query) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const selfMatches = node.name?.toLowerCase().includes(q) || node.description?.toLowerCase().includes(q);
    if (selfMatches) return true;
    return node.children?.some(child => nodeMatchesSearch(child, q));
  };

  // When searching, auto-expand branches that contain matches
  useEffect(() => {
    if (!searchQuery) return;
    const newExpanded = {};
    const dfs = (node, parentExpanded) => {
      const matches = nodeMatchesSearch(node, searchQuery);
      if (matches && parentExpanded !== undefined) {
        newExpanded[String(parentExpanded)] = true;
      }
      node.children?.forEach(child => dfs(child, node.id));
    };
    categoryTreeRoots.forEach(root => dfs(root));
    setExpandedCategories(prev => ({ ...prev, ...newExpanded }));
  }, [searchQuery, categoryTreeRoots]);

  const handleEdit = (category) => {
    setEditingCategory(category);
    setShowModal(true);
  };

  const handleDelete = async (categoryId) => {
    if (window.confirm('Are you sure you want to delete this category? This action cannot be undone.')) {
      try {
        await dispatch(deleteCategory(categoryId)).unwrap();
      } catch (error) {
        console.error('Failed to delete category:', error);
      }
    }
  };

  const toggleExpand = (categoryId) => {
    const key = String(categoryId);
    setExpandedCategories(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const filteredRoots = useMemo(() => {
    if (!searchQuery) return categoryTreeRoots;
    const filterTree = (node) => {
      if (nodeMatchesSearch(node, searchQuery)) {
        // Include node, but also filter children for rendering brevity
        return {
          ...node,
          children: node.children?.map(filterTree).filter(Boolean) || []
        };
      }
      return null;
    };
    return categoryTreeRoots.map(filterTree).filter(Boolean);
  }, [categoryTreeRoots, searchQuery]);

  const renderCategoryRow = (category, level = 0) => {
    const hasChildren = category.children?.length > 0;
    const isExpanded = expandedCategories[String(category.id)];

    return (
      <div key={String(category.id)} className="space-y-2">
        <div 
          className={`p-4 rounded-2xl transition-all duration-300 ${
            level === 0 
              ? 'bg-white/5 border border-white/10 backdrop-blur-md shadow-[0_10px_30px_rgba(0,0,0,0.25)]' 
              : 'bg-white/5 border border-white/10 backdrop-blur-sm'
          } hover:bg-white/10 hover:shadow-[0_16px_36px_rgba(0,0,0,0.35)] flex items-center justify-between group text-white`}
          style={{ marginLeft: `${level * 14}px` }}
        >
          <div className="flex items-center flex-1 min-w-0 gap-3">
            {hasChildren && (
              <button
                onClick={() => toggleExpand(category.id)}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors mr-1"
                title={isExpanded ? 'Collapse' : 'Expand'}
              >
                {isExpanded ? (
                  <ChevronDownIcon className="h-4 w-4 text-white/70" />
                ) : (
                  <ChevronRightIcon className="h-4 w-4 text-white/70" />
                )}
              </button>
            )}
            {level === 0 ? (
              <FolderIcon className="h-5 w-5 text-brand-yellow/90 flex-shrink-0" title="Category" />
            ) : (
              <Squares2X2Icon className="h-5 w-5 text-white/70 flex-shrink-0" title="Subcategory" />
            )}
            <div className="truncate">
              <span className="font-semibold text-white">{category.name}</span>
              {category.description && (
                <p className="text-sm text-white/60 truncate">{category.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => {
                setEditingCategory(null);
                setDefaultParentId(category.id);
                setShowModal(true);
              }}
              className="p-2 text-white/70 hover:text-brand-yellow hover:bg-white/10 rounded-full transition-colors"
              title="Add subcategory"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => handleEdit(category)}
              className="p-2 text-white/70 hover:text-brand-yellow hover:bg-white/10 rounded-full transition-colors"
              title="Edit category"
            >
              <PencilIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => handleDelete(category.id)}
              className="p-2 text-white/70 hover:text-red-400 hover:bg-white/10 rounded-full transition-colors"
              title="Delete category"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
        {hasChildren && isExpanded && (
          <div className="space-y-2 border-l border-white/10 ml-4 pl-4 transition-all duration-300">
            {category.children.map(child => renderCategoryRow(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-[calc(100vh-120px)] px-6 py-6 max-w-6xl mx-auto bg-neutral-950/60 rounded-2xl">
      <div className="mb-8 space-y-5">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-white">Categories</h1>
            <p className="text-white/60">Manage your product categories and subcategories</p>
          </div>
          <button
            onClick={() => {
              setEditingCategory(null);
              setShowModal(true);
            }}
            className="px-4 py-2 rounded-xl bg-brand-yellow text-black font-medium shadow-[0_8px_24px_rgba(255,214,0,0.35)] hover:shadow-[0_12px_28px_rgba(255,214,0,0.45)] hover:bg-brand-yellow/95 active:translate-y-[1px] transition-all duration-200 flex items-center gap-2"
            title="Create a new category"
          >
            <PlusIcon className="h-5 w-5" />
            Add Category
          </button>
        </div>

        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <MagnifyingGlassIcon className="h-5 w-5 text-white/50" />
          </div>
          <input
            type="text"
            placeholder="Search categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 py-2 w-full rounded-xl bg-white/5 text-white placeholder-white/50 border border-white/10 focus:outline-none focus:ring-2 focus:ring-brand-yellow/80 focus:border-brand-yellow/60 transition-all shadow-inner"
            title="Type to filter categories"
          />
        </div>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-yellow mx-auto"></div>
            <p className="mt-2 text-white/70">Loading categories...</p>
          </div>
        ) : filteredRoots.length === 0 ? (
          <div className="text-center py-12 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
            <p className="text-white/70">
              {searchQuery
                ? 'No categories found matching your search'
                : 'No categories yet. Click "Add Category" to create one.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRoots.map(category => renderCategoryRow(category))}
          </div>
        )}
      </div>

      {showModal && (
        <CategoryModal
          category={editingCategory}
          defaultParentId={defaultParentId}
          onClose={() => {
            setShowModal(false);
            setEditingCategory(null);
            setDefaultParentId(null);
          }}
        />
      )}
    </div>
  );
};

export default Categories;
