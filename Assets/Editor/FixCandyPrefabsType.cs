using UnityEngine;
using UnityEditor;

public class FixCandyPrefabsType : ScriptableObject
{
    [MenuItem("Tools/Fix Candy Prefabs Type")]
    public static void FixPrefabsType()
    {
        string[] prefabPaths = {
            "Assets/Prefabs/Red.prefab",
            "Assets/Prefabs/Blue.prefab", 
            "Assets/Prefabs/Green.prefab",
            "Assets/Prefabs/Yellow.prefab",
            "Assets/Prefabs/Purple.prefab",
            "Assets/StripedCandy_Red.prefab",
            "Assets/StripedCandy_Blue.prefab",
            "Assets/StripedCandy_Green.prefab",
            "Assets/StripedCandy_Yellow.prefab",
            "Assets/StripedCandy_Purple.prefab"
        };
        
        foreach (string path in prefabPaths)
        {
            GameObject prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (prefab != null)
            {
                Candy candy = prefab.GetComponent<Candy>();
                if (candy != null)
                {
                    // Prefab'ın tipine göre candyType ata
                    if (path.Contains("Red"))
                        candy.candyType = Candy.CandyType.Red;
                    else if (path.Contains("Blue"))
                        candy.candyType = Candy.CandyType.Blue;
                    else if (path.Contains("Green"))
                        candy.candyType = Candy.CandyType.Green;
                    else if (path.Contains("Yellow"))
                        candy.candyType = Candy.CandyType.Yellow;
                    else if (path.Contains("Purple"))
                        candy.candyType = Candy.CandyType.Magenta;
                    else
                        candy.candyType = Candy.CandyType.Red; // Varsayılan
                    
                    // candyId ve candyID'yi candyType ile eşleştir
                    candy.candyId = (int)candy.candyType;
                    candy.candyID = (int)candy.candyType;
                    
                    EditorUtility.SetDirty(candy);
                    Debug.Log($"Fixed candyType for {path}: {candy.candyType}");
                }
                
                PrefabUtility.SaveAsPrefabAsset(prefab, path);
            }
        }
        
        AssetDatabase.SaveAssets();
        AssetDatabase.Refresh();
        Debug.Log("All candy prefabs fixed with correct candyType!");
    }
}
