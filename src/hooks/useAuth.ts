import { useState, useEffect } from 'react';
import { supabase } from '../services/db/supabaseClient';
import { User } from '@supabase/supabase-js';
import { TeacherProfile } from '../types';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [teacherProfile, setTeacherProfile] = useState<TeacherProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadTeacherProfile(session.user);
      } else {
        setLoading(false);
      }
    });

    // Listen for changes on auth state (logged in, signed out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadTeacherProfile(session.user);
      } else {
        setTeacherProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadTeacherProfile = async (authUser: User) => {
    setLoading(true);
    try {
      // 1. Try to fetch from Supabase
      const { data, error } = await supabase
        .from('teacher_profiles')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      if (error) {
         console.error("Error fetching teacher profile from Supabase", error);
      }

      const storageKey = `sg_pe_profile_${authUser.id}`;
      const localSaved = localStorage.getItem(storageKey);
      let localProfile: TeacherProfile | null = null;

      if (localSaved) {
        try {
          localProfile = JSON.parse(localSaved);
        } catch (e) {
          console.error("Failed to parse local profile", e);
        }
      }

      let profile: TeacherProfile;

      if (data) {
        // We have data in Supabase - this is the source of truth
        profile = {
          id: data.id,
          email: data.email,
          name: data.name,
          avatar_url: data.avatar_url,
          customRubrics: data.custom_rubrics || {}
        };
        
        // Sync local storage just in case (offline support)
        localStorage.setItem(storageKey, JSON.stringify(profile));
      } else {
        // No data in Supabase - check if we need to migrate from local storage
        profile = localProfile || {
          id: authUser.id,
          email: authUser.email,
          name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0],
          avatar_url: authUser.user_metadata?.avatar_url,
          customRubrics: {}
        };

        // Create the profile in Supabase
        const { error: insertError } = await supabase
          .from('teacher_profiles')
          .upsert({
            id: profile.id,
            email: profile.email,
            name: profile.name,
            avatar_url: profile.avatar_url,
            custom_rubrics: profile.customRubrics
          });

        if (insertError) {
          console.error("Failed to push initial profile to Supabase", insertError);
        }
      }

      setTeacherProfile(profile);
    } catch (err) {
      console.error("Unexpected error loading teacher profile", err);
    } finally {
      setLoading(false);
    }
  };

  const updateTeacherProfile = async (updatedProfile: TeacherProfile) => {
    if (!user) return;
    
    // Update local state and storage
    setTeacherProfile(updatedProfile);
    const storageKey = `sg_pe_profile_${user.id}`;
    localStorage.setItem(storageKey, JSON.stringify(updatedProfile));

    // Consistently push to Supabase
    const { error } = await supabase
      .from('teacher_profiles')
      .upsert({
        id: updatedProfile.id,
        email: updatedProfile.email,
        name: updatedProfile.name,
        avatar_url: updatedProfile.avatar_url,
        custom_rubrics: updatedProfile.customRubrics,
        updated_at: new Date().toISOString()
      });

    if (error) {
       console.error("Failed to sync profile change to Supabase", error);
    }
  };

  const signInWithGoogle = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        skipBrowserRedirect: false, // Ensure redirect flow on mobile
      }
    });
    if (error) {
      console.error('Error logging in with Google:', error);
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    if (user) {
      localStorage.removeItem(`sg_pe_profile_${user.id}`);
    }
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error logging out:', error);
    }
    setLoading(false);
  };

  return {
    user,
    teacherProfile,
    loading,
    signInWithGoogle,
    signOut,
    updateTeacherProfile
  };
};
